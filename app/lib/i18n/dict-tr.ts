// Turkish dictionary. Mirrors every key in dict-en.ts.

import type { DictKey } from "./dict-en";

export const tr: Record<DictKey, string> = {
  // ---- Navbar + footer ----
  "nav.howItWorks": "Nasıl çalışır",
  "nav.homes": "Evler",
  "nav.insurance": "Sigorta",
  "nav.pricing": "Fiyatlandırma",
  "nav.companies": "Şirketler",
  "nav.signIn": "Giriş yap",
  "nav.listMyHome": "Evini ekle",
  "nav.mySwaps": "Takaslarım",
  "nav.dashboard": "Panel",
  "footer.tagline": "© 2026 swapl · anahtar için anahtar, para yok",
  "footer.howItWorks": "Nasıl çalışır",
  "footer.insurance": "Sigorta",
  "footer.browseHomes": "Evlere göz at",
  "footer.account": "Hesap",

  // ---- Launch banner ----
  "launchBanner.tag": "Lansman öncesi",
  "launchBanner.body": "Komisyon yok, her takas sigortalı — takaslar başlıyor",
  "launchBanner.month": "Eylül 2026",
  "launchBanner.cta": "Evini ekle →",

  // ---- Marketing landing ----
  "hero.kicker": "Komisyon yok · Her takas sigortalı · Eylül 2026'da başlıyor",
  "hero.titleA": "Anahtar için anahtar.",
  "hero.titleB": "Para yok, tamamen",
  "hero.titleEm": "sigortalı",
  "hero.intro":
    "Kabul edilen her takas baştan sona sigortalıdır ve hiç para el değiştirmez — yalnızca anahtar için anahtar. Eylül 2026 lansmanı öncesinde kurucu ev sahiplerini topluyoruz: evini şimdi titiz bir doğrulukla ekle ve takaslar başladığında ilk gösterilen evler arasında ol.",
  "hero.ctaList": "Evimi ekle",
  "hero.ctaHow": "Nasıl çalıştığını gör",

  "how.kicker": "01 · Nasıl çalışır",
  "how.title": "Dört adım. Faturasız. Sadece anahtar.",
  "how.lede":
    "Ev takası ne kiralamadır ne de alt kiralama. Seyahat misafirperverliğinin en eski biçimidir, modern araçlarla güvenli kılınmıştır.",
  "how.step1.title": "Hassasiyetle listele",
  "how.step1.desc":
    "Her pencere, her priz, her basamak. İlan formumuz önemli ayrıntıları yakalar — böylece takas partnerin zaten tanıdığı bir yere gelir.",
  "how.step2.title": "Filtrele ve eşleştir",
  "how.step2.desc":
    "Şehir, tarih, metrekare, evcil hayvan, evden çalışma uygunluğu, erişilebilirlik ayarla. Yalnızca seninle takas etmek isteyen ev sahiplerinin evleri görünür.",
  "how.step3.title": "Teklif ver ve anlaş",
  "how.step3.desc":
    "Kendi evini ekleyerek takas teklifi gönder. Kabul, reddet ya da karşı teklif. Fiyat işin parçası değil — bir ev, bir eve.",
  "how.step4.title": "Sigortalı seyahat",
  "how.step4.desc":
    "Kabul edilen her takas otomatik olarak güvence altında: mülk, sorumluluk ve seyahat aksaması. İkiniz de anahtar, kod ve 7/24 hat alırsınız.",

  "live.kicker": "02 · Takas arayan evler",
  "live.title": "Gerçek evler. Gerçek takaslar. Şu anda.",
  "live.lede":
    "Üç canlı eşleşme — her evin sahibi diğerini istiyor. Boyut, fiyat ve metrekarenin uyuşması gerekmiyor. Tek kural: seninkini sunup onunkini alırsın.",
  "live.yours": "Seninki",
  "live.theirs": "Onunki",

  "filter.kicker": "03 · Eşleşmeni bul",
  "filter.title": "Tek olanı bulmak için yeterince keskin filtreler.",
  "filter.lede":
    "Çoğu ilan sitesi sana sadece şehir ve fiyat verir. Biz 40+ özelliğe ince ayar yapmana izin veririz ve — en önemlisi — yalnızca sahipleri seninkiyle takas etmek isteyen evleri gösteririz.",
  "filter.destinationCity": "Hedef şehir",
  "filter.propertyType": "Mülk türü",
  "filter.minSize": "Asgari boyut",
  "filter.sleepsAtLeast": "En az kişi",
  "filter.mustHaves": "Olmazsa olmazlar",
  "filter.petFriendly": "Evcil hayvan dostu",
  "filter.wfh": "Evden çalışma düzeni",
  "filter.stepFree": "Basamaksız erişim",
  "filter.mutualOnly": "Yalnızca",
  "filter.mutualEm": "karşılıklı",
  "filter.mutualSwaps": "takaslar",
  "filter.homesReady": "takasa hazır ev",
  "filter.sortMatch": "Sırala: eşleşme puanı ↓",
  "filter.proposeSwap": "Takas öner",

  "insuranceBand.kicker": "04 · Sigorta, her zaman açık",
  "insuranceBand.title": "Her takas güvende.",
  "insuranceBand.titleEm": "Onay gerekmez.",
  "insuranceBand.lede":
    "Takaslar kira değildir, ama yine de evlerini birbirine emanet eden iki ailedir. Kabul edilen her değişimi otomatik olarak sigortalıyoruz — onay kutusu yok, ek satış yok.",
  "insuranceBand.cardA.title": "150 bin €'ya kadar mülk hasarı",
  "insuranceBand.cardA.body":
    "Bir takas sırasında bir şey kırılır, çatlar, su basar veya kaybolursa — her iki yön, her iki ev için kapsam altındadır.",
  "insuranceBand.cardB.title": "Üçüncü şahıs sorumluluğu",
  "insuranceBand.cardB.body":
    "Misafir mutfağında kayar. Yan dairede boru patlar. Poliçemiz halleder, böylece takas davaya dönüşmez.",
  "insuranceBand.cardC.title": "Seyahat aksaması",
  "insuranceBand.cardC.body":
    "Uçuş iptal, partner geri çekildi, salgın? Ya geri ödenirsin ya da 48 saat içinde eşdeğer bir evle yeniden eşleştirilirsin.",

  "cta.title": "Evin bin seyahat değerinde.",
  "cta.body":
    "İlanları şimdi topluyoruz — erken erişim Eylül 2026'da açılıyor. Lansmandan önce listeleyen ev sahipleri ilk önce görünür.",
  "cta.button": "Davet iste",
  "cta.sent": "Listedesin ✓",
  "cta.error": "Bir şeyler ters gitti. Birazdan tekrar dene.",
  "cta.placeholder": "sen@email.com",
  "cta.stat.countries": "◦ 92 ülke",
  "cta.stat.insurance": "◦ Sigorta dahil",
  "cta.stat.noFees": "◦ Ev sahibi ücreti yok",
  "cta.stat.noCommission": "◦ Platform komisyonu yok",

  // ---- Auth ----
  "auth.login.title": "Tekrar hoş geldin.",
  "auth.login.lede": "İlanını ve takas tekliflerini yönetmek için giriş yap.",
  "auth.login.email": "E-posta",
  "auth.login.password": "Şifre",
  "auth.login.forgot": "Unuttun mu?",
  "auth.login.submit": "Giriş yap",
  "auth.login.submitting": "Giriş yapılıyor…",
  "auth.login.newHere": "Yeni misin?",
  "auth.login.createAccount": "Hesap oluştur",
  "auth.register.title": "Lansmandan önce evini ekle.",
  "auth.register.lede":
    "Eylül 2026 lansmanı öncesinde ilanları topluyoruz. Kayıt 30 saniye sürer ve takaslar başladığında ilanın standart sonuçların üstünde çıkar.",
  "auth.register.submit": "Hesap oluştur",
  "auth.register.submitting": "Oluşturuluyor…",
  "auth.register.haveAccount": "Zaten hesabın var mı?",
  "auth.forgot.title": "E-posta ile sıfırla.",
  "auth.forgot.lede":
    "Kayıt olduğun e-postayı gir — bir saat geçerli tek seferlik bağlantı göndereceğiz.",
  "auth.forgot.submit": "Sıfırlama bağlantısı gönder",
  "auth.forgot.submitting": "Gönderiliyor…",
  "auth.forgot.sentTitle": "Sıfırlama bağlantısı yolda.",
  "auth.forgot.sentBody":
    "O e-posta bir hesapla eşleşiyorsa, sıfırlama bağlantısını gönderdik. Bir saat geçerli. E-posta gelmiyorsa spam'i kontrol et, sonra tekrar dene.",
  "auth.forgot.backLogin": "Girişe dön",
  "auth.reset.title": "Yeni bir tane seç.",
  "auth.reset.lede":
    "Başka hiçbir yerde kullanmadığın bir şifre seç. En az altı karakter.",
  "auth.reset.newPassword": "Yeni şifre",
  "auth.reset.confirm": "Şifreyi onayla",
  "auth.reset.submit": "Yeni şifreyi kaydet",
  "auth.reset.submitting": "Sıfırlanıyor…",
  "auth.reset.mismatch": "Şifreler eşleşmiyor.",
  "auth.reset.tooShort": "Şifre en az 6 karakter olmalı.",
  "auth.reset.missingTitle": "Sıfırlama tokeni eksik.",
  "auth.reset.missingBody": "Sana gönderdiğimiz e-postadaki bağlantıyı aç ya da yenisini iste.",
  "auth.reset.requestLink": "Sıfırlama bağlantısı iste",
  "auth.verify.okTitle": "Doğrulandın.",
  "auth.verify.okBody": "E-postan onaylandı — tüm özellikler açıldı. Aramıza hoş geldin.",
  "auth.verify.expiredTitle": "Bu bağlantının süresi dolmuş.",
  "auth.verify.expiredBody":
    "Doğrulama bağlantıları 7 gün geçerlidir. Gelen kutuna yeni bir tane gönderebiliriz.",
  "auth.verify.usedTitle": "Bağlantı zaten kullanıldı.",
  "auth.verify.usedBody":
    "Bu doğrulama bağlantısı tüketildi. E-postan zaten doğrulanmış.",
  "auth.verify.invalidTitle": "Hmm, bu bağlantı doğru görünmüyor.",
  "auth.verify.invalidBody":
    "Ya kurcalandı ya da hiç var olmadı. /account üzerinden yenisini iste.",
  "auth.verify.toDashboard": "Panele git",
  "auth.verify.resend": "Doğrulama e-postasını yeniden gönder",
  "auth.verify.resending": "Gönderiliyor…",
  "auth.verify.resent": "Gönderildi — gelen kutunu kontrol et",

  // ---- Verify-email banner ----
  "verifyBanner.label": "Doğrula",
  "verifyBanner.bodyA": "E-postanı doğrula:",
  "verifyBanner.bodyB":
    "her şeyi açmak için. Gelen kutundaki bağlantı 7 gün geçerli.",
  "verifyBanner.resend": "E-postayı yeniden gönder",
  "verifyBanner.sending": "Gönderiliyor…",
  "verifyBanner.sent": "✓ E-posta yeniden gönderildi",

  // ---- Pricing ----
  "pricing.kicker": "Fiyatlandırma",
  "pricing.title": "Ev takası ücretsiz.",
  "pricing.titleEm": "Sonsuza kadar.",
  "pricing.lede":
    "Takasından komisyon almıyoruz. Yalnızca güçlü kullanıcı araçları istersen öde — uyarılı kayıtlı aramalar, öncelikli yerleştirme, çoklu ev hesapları, ilan analizleri. Temel takas herkes için aynı kalacak.",
  "pricing.tags.noFees": "◦ Takas ücreti yok",
  "pricing.tags.noCommission": "◦ Platform komisyonu yok",
  "pricing.tags.insurance": "◦ Her planda sigorta dahil",
  "pricing.toggle.monthly": "Aylık",
  "pricing.toggle.yearly": "Yıllık · %30 tasarruf",
  "pricing.popular": "En popüler",
  "pricing.cycle.month": "/ay",
  "pricing.cycle.year": "/yıl",
  "pricing.billedAnnually": "yıllık faturalandırılır",
  "pricing.cta.getStarted": "Başla",
  "pricing.cta.upgradePlus": "Plus'a yükselt",
  "pricing.cta.upgradePro": "Pro'ya yükselt",
  "pricing.legal":
    "Tüm fiyatlar EUR cinsindendir. KDV, faturalama ülkene göre ödeme sırasında gösterilir. İstediğin zaman iptal et — erişimin mevcut dönem sonuna kadar sürer.",
  "pricing.manageBilling": "Faturalamayı yönet",
  "pricing.checkoutSoon":
    "Ödeme henüz mevcut değil — Stripe lansmanda açılacak.",
  "pricing.checkoutFailed": "Ödeme başlatılamadı.",
  "pricing.loading": "Yükleniyor…",

  // ---- Dashboard ----
  "dashboard.greeting": "Merhaba",
  "dashboard.title": "Takas panelin",
  "dashboard.statWaitingOnYou": "Seni bekliyor",
  "dashboard.statSentAwaiting": "Gönderildi — yanıt bekleniyor",
  "dashboard.statActiveSwaps": "Aktif takaslar",
  "dashboard.yourListings": "İlanların",
  "dashboard.newListing": "+ Yeni ev ekle",
  "dashboard.empty.title": "Henüz ilan yok.",
  "dashboard.empty.body": "Takas önermeden önce bir ev yayınlamalısın.",
  "dashboard.empty.cta": "Evimi ekle",
  "dashboard.account": "Hesap",
  "dashboard.accountSettings": "Hesap ayarları",
  "dashboard.signOut": "Çıkış yap",
  "dashboard.signedInAs": "Giriş yapıldı:",

  // ---- Account ----
  "account.title": "Ayarlar",
  "account.kicker": "Hesap",
  "account.email": "E-posta",
  "account.name": "Ad",
  "account.joined": "Katıldı",
  "account.identityTitle": "Kimlik doğrulama",
  "account.identityVerified": "Doğrulandı",
  "account.identityUnverified": "Doğrulanmadı",
  "account.identityRequired": "İlk takas kabulünden önce gerekli.",
  "account.identityBlurb":
    "Teklif kabulünde tek seferlik bir KYC kontrolü (pasaport / kimlik) kullanırız. Verilerin diğer ev sahibiyle paylaşılmaz.",
  "account.interests.title": "İlgi alanların",
  "account.interests.body":
    "Bir yerde gerçekten sevdiğin şeyleri seç — kahve, caz, sörf, vintage, ne olursa. Kamuya açık profilinde görünür ve takasın sırasındaki AI önerilerini hoşlandığın şeylere uyan partnerlere yönlendirir.",
  "account.interests.cta": "İlgi alanlarını düzenle",
  "account.savedSearches.title": "Kayıtlı aramalar",
  "account.savedSearches.body":
    "/listings sayfasından bir filtre kombinasyonunu sabitle, eşleşen yeni evlerin günlük özetini sana e-postayla gönderelim. Plus ve Pro üyeleri 20'ye kadar kayıtlı arama tutabilir.",
  "account.savedSearches.cta": "Kayıtlı aramaları yönet",
  "account.notifications.title": "Bildirimler",
  "account.notifications.body":
    "Yeni teklifler, yanıtlar ve kabul edilen takaslar için e-posta varsayılan olarak açıktır. Sana asla pazarlama e-postası göndermeyiz.",
  "account.signOut.title": "Çıkış yap",
  "account.signOut.cta": "swapl'dan çıkış yap",

  // ---- Browse + listing ----
  "listings.title": "Takasa hazır evler",
  "listings.totalSuffix": "ev filtrelerinle eşleşiyor. Eşleşme puanları kendi ilanına göre uyarlanır.",
  "listings.matchingAgainst": "Eşleştirilen:",
  "listings.listFirst.cta": "Evini ekle",
  "listings.listFirst.body": "kişiselleştirilmiş eşleşme puanlarını görmek için",
  "listings.empty.title": "Bu filtrelere uyan ev yok.",
  "listings.empty.body": "Bir iki filtreyi gevşet — çoğu ev pencereleri içindeki tarihlerde esnektir.",
  "listings.empty.reset": "Filtreleri sıfırla",
  "listings.previous": "← Önceki",
  "listings.next": "Sonraki →",
  "listings.pageOf": "Sayfa {n} / {total}",
  "listing.about": "Bu ev hakkında",
  "listing.theSpace": "Mekân",
  "listing.amenities": "Olanaklar",
  "listing.available": "Müsait",
  "listing.hostedBy": "Ev sahibi:",
  "listing.tradeBlurb":
    "Kendi ilanınla birlikte takas teklifi gönder. Kabul, reddet ya da karşı teklif — asla para yok.",
  "listing.editYours": "Düzenle",
  "listing.signInToPropose": "Takas önermek için giriş yap",
  "listing.listFirst": "Önce evini ekle",
  "listing.proposeSwap": "Takas öner",
  "listing.match.title": "Bu neden harika bir eşleşme olabilir",

  // ---- Swap thread ----
  "swap.allSwaps": "← Tüm takaslar",
  "swap.statusLabel": "Teklif ·",
  "swap.original": "Asıl teklif",
  "swap.counter": "Karşı teklif",
  "swap.agreementTitle": "Takas onaylandı — anahtar için anahtar",
  "swap.guestCode": "Misafirinin kodu (senin evinde kullanması için)",
  "swap.yourCode": "Senin kodun (onların evinde kullanman için)",
  "swap.policyLine":
    "Poliçe {policy} · €{coverage} kapsam · 7/24 hat: +44 800 000 swap",

  // ---- Common UI ----
  "ui.cancel": "İptal",
  "ui.save": "Kaydet",
  "ui.continue": "Devam",
  "ui.back": "Geri",
  "ui.close": "×",
  "ui.optional": "(isteğe bağlı)",
  "ui.required": "Gerekli",

  // ---- Locale switcher ----
  "locale.label": "Dil",
  "locale.changeTo": "Şuna geç:",
};
