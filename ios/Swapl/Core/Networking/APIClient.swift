import Foundation

// Lightweight URLSession wrapper. Reads the API base from an Info.plist key
// (set via Xcode build settings / scheme env), defaulting to localhost for
// dev. Every request goes through `send()` which injects the Bearer token
// and decodes JSON via JSONDecoder with iso8601 dates.
final class APIClient: @unchecked Sendable {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    let baseURL: URL

    var tokenProvider: (() -> String?)?
    // Invoked once on a 401; returns true if a fresh token is now available, in
    // which case the failed request is retried a single time.
    var tokenRefresher: (() async -> Bool)?

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)

        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        let envURL = ProcessInfo.processInfo.environment["SWAPL_API_BASE_URL"]
        let plistURL = (Bundle.main.object(forInfoDictionaryKey: "SwaplApiBaseURL") as? String)
        let raw = envURL ?? plistURL ?? "http://localhost:3000"
        self.baseURL = URL(string: raw) ?? URL(string: "http://localhost:3000")!
    }

    enum APIError: Error, LocalizedError {
        case status(Int, String?)
        case decoding(Error)
        case transport(Error)
        case unauthenticated

        var errorDescription: String? {
            switch self {
            case .status(let code, let body): return "HTTP \(code): \(body ?? "")"
            case .decoding(let e): return "Decoding: \(e.localizedDescription)"
            case .transport(let e): return e.localizedDescription
            case .unauthenticated: return "Please sign in to continue."
            }
        }
    }

    func send<Response: Decodable>(
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        body: Encodable? = nil,
        as: Response.Type = Response.self,
        allowRefresh: Bool = true
    ) async throws -> Response {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var req = URLRequest(url: components.url!)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = tokenProvider?() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try encoder.encode(AnyEncodable(body))
        }

        do {
            let (data, response) = try await session.data(for: req)
            let http = response as! HTTPURLResponse
            if http.statusCode == 401 {
                if allowRefresh, let refresher = tokenRefresher, await refresher() {
                    return try await send(method, path, query: query, body: body, as: Response.self, allowRefresh: false)
                }
                throw APIError.unauthenticated
            }
            guard (200..<300).contains(http.statusCode) else {
                throw APIError.status(http.statusCode, String(data: data, encoding: .utf8))
            }
            do {
                return try decoder.decode(Response.self, from: data)
            } catch {
                throw APIError.decoding(error)
            }
        } catch let err as APIError {
            throw err
        } catch {
            throw APIError.transport(error)
        }
    }

    // Multipart image upload for native clients → /api/uploads/listing-photo
    // (bearer-authed; stored in UploadThing server-side). Returns the photo URL.
    func uploadListingPhoto(_ imageData: Data, filename: String = "photo.jpg", mimeType: String = "image/jpeg") async throws -> String {
        let boundary = "swapl-\(UUID().uuidString)"
        var req = URLRequest(url: baseURL.appendingPathComponent("/api/uploads/listing-photo"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = tokenProvider?() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        func append(_ s: String) { body.append(s.data(using: .utf8)!) }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(imageData)
        append("\r\n--\(boundary)--\r\n")
        req.httpBody = body

        do {
            let (data, response) = try await session.data(for: req)
            let http = response as! HTTPURLResponse
            if http.statusCode == 401 { throw APIError.unauthenticated }
            guard (200..<300).contains(http.statusCode) else {
                throw APIError.status(http.statusCode, String(data: data, encoding: .utf8))
            }
            struct UploadResponse: Decodable { let url: String }
            return try decoder.decode(UploadResponse.self, from: data).url
        } catch let err as APIError {
            throw err
        } catch {
            throw APIError.transport(error)
        }
    }
}

private struct AnyEncodable: Encodable {
    let _encode: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { _encode = wrapped.encode }
    func encode(to encoder: Encoder) throws { try _encode(encoder) }
}

struct EmptyResponse: Decodable {}
