import Foundation
import Observation
import Speech
import AVFoundation

// Voice input for the Inspire prompt (DOK-148): SFSpeechRecognizer +
// AVAudioEngine with live partial results streamed into `transcript`.
// Recognition runs on-device whenever the recognizer supports it
// (requiresOnDeviceRecognition) — audio never reaches our servers either
// way; Apple's framework handles the transcription.
@MainActor
@Observable
final class SpeechRecorder {
    enum State: Equatable {
        case idle
        case recording
        /// Mic or speech permission denied — surfaced as a muted hint.
        case denied
        /// No recognizer for the current locale, or it is offline.
        case unavailable
    }

    var state: State = .idle
    /// Live transcript of the CURRENT recording session (partial results
    /// replace, not append — the view composes it onto the prompt base).
    var transcript = ""

    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    var isRecording: Bool { state == .recording }

    func toggle() async {
        if isRecording {
            stop()
        } else {
            await start()
        }
    }

    func start() async {
        guard !isRecording else { return }

        let speechStatus = await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0) }
        }
        guard speechStatus == .authorized else {
            state = .denied
            return
        }
        let micGranted = await AVAudioApplication.requestRecordPermission()
        guard micGranted else {
            state = .denied
            return
        }
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
            state = .unavailable
            return
        }

        transcript = ""
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // Privacy: prefer fully on-device transcription when the model is
        // available for the locale.
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        self.request = request

        do {
            // Configuring/activating the audio session is slow and must not run
            // on the main thread (AVAudioSession hang risk) — do it off the main
            // actor and await it before wiring up the engine.
            try await Task.detached(priority: .userInitiated) { try Self.activateSession() }.value

            let inputNode = audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            inputNode.removeTap(onBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            audioEngine.prepare()
            try audioEngine.start()
        } catch {
            cleanUp()
            state = .unavailable
            return
        }

        state = .recording
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let result {
                    self.transcript = result.bestTranscription.formattedString
                }
                if error != nil || (result?.isFinal ?? false) {
                    if self.isRecording { self.stop() }
                }
            }
        }
    }

    func stop() {
        cleanUp()
        if state == .recording { state = .idle }
    }

    private func cleanUp() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        request = nil
        task?.cancel()
        task = nil
        // Deactivate off the main actor too — same hang risk; fire-and-forget
        // since teardown ordering isn't critical.
        Task.detached(priority: .utility) { Self.deactivateSession() }
    }

    // AVAudioSession (de)activation is slow; these run off the main actor.
    private nonisolated static func activateSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    }

    private nonisolated static func deactivateSession() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
