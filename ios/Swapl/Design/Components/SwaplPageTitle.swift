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
            Spacer(minLength: 0)
            trailing()
        }
        .padding(.horizontal, 22)
        .padding(.top, 22)
    }
}
