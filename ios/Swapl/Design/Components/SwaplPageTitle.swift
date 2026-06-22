import SwiftUI
import SwaplDesignTokens

// Brand page title shown at the top of every root tab (Explore, Wishlists,
// Trips, Messages, Profile). Owns the standard padding so the title aligns
// identically across tabs; pass trailing content for accessory controls
// (e.g. the search toggle on Messages).
struct SwaplPageTitle<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: () -> Trailing

    init(_ title: String, @ViewBuilder trailing: @escaping () -> Trailing) {
        self.title = title
        self.trailing = trailing
    }

    init(_ title: String) where Trailing == EmptyView {
        self.init(title) { EmptyView() }
    }

    var body: some View {
        HStack(alignment: .center) {
            Text(title)
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.display, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                // Keep the title on one line so trailing controls never squeeze it
                // into a wrap (e.g. Wishlists' filter pills).
                .lineLimit(1)
            Spacer(minLength: 0)
            trailing()
        }
        .padding(.horizontal, 22)
        .padding(.top, 22)
    }
}

// Floating Liquid-Glass header for pushed detail pages: a glass back chevron on
// the left and a centered glass title pill over the cream background — no opaque
// system navigation bar. Reserves its own height (content sits below it, never
// hidden) and paints the cream background behind itself so there's no stray band.
// Swipe-to-go-back is preserved via the gesture delegate restored in SwaplApp.
private struct SwaplFloatingHeader<Trailing: View>: ViewModifier {
    let title: String
    let trailing: Trailing
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        content
            .toolbar(.hidden, for: .navigationBar)
            .navigationBarBackButtonHidden(true)
            .safeAreaInset(edge: .top) {
                ZStack {
                    Text(title)
                        .font(.swaplBody(16, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .glassEffect(.regular, in: .capsule)

                    HStack(spacing: 0) {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                                .frame(width: 44, height: 44)
                                .glassEffect(.regular.interactive(), in: .circle)
                        }
                        .accessibilityLabel("Back")
                        Spacer(minLength: 0)
                        trailing
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
            }
            // Applied AFTER the inset so the cream fills behind the header too.
            .background(SwaplSemanticLight.background.ignoresSafeArea())
    }
}

extension View {
    // Replaces the system nav bar with a floating glass back + title pill.
    func swaplFloatingHeader(_ title: String) -> some View {
        modifier(SwaplFloatingHeader(title: title, trailing: EmptyView()))
    }

    // Variant with a trailing action (e.g. a Save or + button) on the right.
    func swaplFloatingHeader<Trailing: View>(_ title: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        modifier(SwaplFloatingHeader(title: title, trailing: trailing()))
    }
}
