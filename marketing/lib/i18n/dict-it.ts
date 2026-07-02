// Italian dictionary. Keep keys 1:1 with dict-en.ts. Strings written to
// feel native rather than literal — we don't translate "swapl" itself.

import type { DictKey } from "./dict-en";

export const it: Partial<Record<DictKey, string>> = {
  // ---- Navbar + footer ----
  "nav.howItWorks": "Come funziona",
  "nav.homes": "Case",
  "nav.insurance": "Garanzia",
  "nav.pricing": "Prezzi",
  "nav.companies": "Aziende",
  "nav.signIn": "Accedi",
  "nav.listMyHome": "Pubblica casa",
  "nav.mySwaps": "I miei scambi",
  "nav.dashboard": "Dashboard",
  "footer.tagline": "© 2026 swapl · chiavi per chiavi, niente soldi",
  "footer.howItWorks": "Come funziona",
  "footer.insurance": "Garanzia",
  "footer.browseHomes": "Esplora case",
  "footer.account": "Account",

  // ---- Launch banner ----
  "launchBanner.tag": "Pre-lancio",
  "launchBanner.body": "Nessuna commissione, ogni scambio protetto dalla Garanzia Swapl — gli scambi partono",
  "launchBanner.month": "a settembre 2026",
  "launchBanner.cta": "Pubblica la tua →",

  // ---- Marketing landing ----
  "hero.kicker": "Nessuna commissione · Ogni scambio protetto · Lancio a settembre 2026",
  "hero.titleA": "Chiavi contro chiavi.",
  "hero.titleB": "Niente soldi, tutto",
  "hero.titleEm": "protetto",
  "hero.intro":
    "Ogni scambio accettato è protetto dalla Garanzia Swapl e non passa mai denaro di mano — solo chiavi contro chiavi. Stiamo raccogliendo le case fondatrici in vista del lancio di settembre 2026: pubblica la tua adesso, con dettagli precisi, e sarai tra le prime a comparire quando inizieranno gli scambi.",
  "hero.ctaList": "Pubblica casa",
  "hero.ctaHow": "Vedi come funziona",

  "how.kicker": "01 · Come funziona",
  "how.title": "Quattro passi. Niente fatture. Solo chiavi.",
  "how.lede":
    "Lo scambio casa non è un affitto né un sublocazione. È la più antica forma di ospitalità di viaggio, con strumenti moderni per renderla sicura.",
  "how.step1.title": "Pubblica con cura",
  "how.step1.desc":
    "Ogni finestra, ogni presa, ogni gradino. Il modulo cattura i dettagli che contano — così chi viene da te atterra in un posto che già conosce.",
  "how.step2.title": "Filtra e abbina",
  "how.step2.desc":
    "Imposta città, date, metri quadri, animali, postazione di lavoro, accessibilità. Vedi solo le case di chi vuole scambiare con te.",
  "how.step3.title": "Proponi e accordatevi",
  "how.step3.desc":
    "Invia una richiesta di scambio con la tua casa allegata. Accettano, rifiutano o controproposta. Il prezzo non c'entra — una casa per l'altra.",
  "how.step4.title": "Viaggia, protetto",
  "how.step4.desc":
    "Ogni scambio accettato include la Garanzia Swapl — il nostro team di risoluzione è dalla tua parte, e puoi aggiungere la Copertura completa fino a 5.000 €. Avete entrambi chiavi, codici e una linea 24/7.",

  "live.kicker": "02 · Case che cercano scambio",
  "live.title": "Case vere. Scambi veri. Adesso.",
  "live.lede":
    "Tre coppie attive — i proprietari vogliono lo scambio reciproco. Dimensioni, prezzi, metri quadri non devono coincidere. L'unica regola: offri la tua per avere la loro.",
  "live.yours": "La tua",
  "live.theirs": "La loro",

  "filter.kicker": "03 · Trova l'abbinamento",
  "filter.title": "Filtri abbastanza precisi da trovare quella giusta.",
  "filter.lede":
    "I siti tradizionali ti danno città e prezzo. Qui regoli più di 40 attributi e — soprattutto — vedi solo le case dei proprietari che vogliono scambiare con la tua.",
  "filter.destinationCity": "Città di destinazione",
  "filter.propertyType": "Tipologia",
  "filter.minSize": "Dimensione minima",
  "filter.sleepsAtLeast": "Posti letto almeno",
  "filter.mustHaves": "Imprescindibili",
  "filter.petFriendly": "Amici animali ammessi",
  "filter.wfh": "Postazione smart-working",
  "filter.stepFree": "Accesso senza scalini",
  "filter.mutualOnly": "Solo",
  "filter.mutualEm": "scambi reciproci",
  "filter.mutualSwaps": "",
  "filter.homesReady": "case pronte allo scambio",
  "filter.sortMatch": "Ordina: match score ↓",
  "filter.proposeSwap": "Proponi scambio",

  "insuranceBand.kicker": "04 · La Garanzia Swapl",
  "insuranceBand.title": "Ogni scambio, protetto.",
  "insuranceBand.titleEm": "Senza opt-in.",
  "insuranceBand.lede":
    "Gli scambi non sono affitti, ma restano due famiglie che si affidano la casa a vicenda. Ogni scambio accettato include la Garanzia Swapl — il nostro impegno ad aiutarti a sistemare le cose. È una garanzia di swapl, non una polizza assicurativa.",
  "insuranceBand.cardA.title": "Copertura completa fino a 5.000 €",
  "insuranceBand.cardA.body":
    "Aggiungi la Copertura completa a qualsiasi scambio e ti aiutiamo con i danni accidentali fino a 5.000 €, con una franchigia di 750 € — in entrambe le direzioni, in entrambe le case.",
  "insuranceBand.cardB.title": "Una squadra dalla tua parte",
  "insuranceBand.cardB.body":
    "Inclusa gratis in ogni scambio: se un ospite scivola, una tubatura scoppia o uno scambio prende una brutta piega, il nostro team di risoluzione interviene in fretta perché non si trasformi in un braccio di ferro.",
  "insuranceBand.cardC.title": "I piani cambiano",
  "insuranceBand.cardC.body":
    "Volo cancellato, partner che si tira indietro? Ti aiutiamo a trovare un nuovo abbinamento con una casa altrettanto adatta — o a recuperare le Chiavi che hai speso.",

  "cta.title": "La tua casa vale mille viaggi.",
  "cta.body":
    "Stiamo raccogliendo case ora — l'accesso anticipato apre a settembre 2026. Chi pubblica prima del lancio appare per primo.",
  "cta.button": "Richiedi invito",
  "cta.sent": "Sei in lista ✓",
  "cta.confirmation": "Sei nella lista. Ti scriveremo appena gli scambi saranno attivi — e ancora prima se sei in una città dove i match si accumulano.",
  "cta.error": "Qualcosa è andato storto. Riprova tra un attimo.",
  "cta.placeholder": "tua@email.com",
  "cta.stat.countries": "◦ 92 paesi",
  "cta.stat.insurance": "◦ Garanzia Swapl inclusa",
  "cta.stat.noFees": "◦ Nessun costo per gli host",
  "cta.stat.noCommission": "◦ Nessuna commissione",

  // ---- Auth ----
  "auth.login.title": "Bentornato.",
  "auth.login.lede": "Accedi per gestire la tua casa e le proposte di scambio.",
  "auth.login.email": "Email",
  "auth.login.password": "Password",
  "auth.login.forgot": "Dimenticata?",
  "auth.login.submit": "Accedi",
  "auth.login.submitting": "Accesso…",
  "auth.login.newHere": "Nuovo qui?",
  "auth.login.createAccount": "Crea un account",
  "auth.register.title": "Pubblica casa prima del lancio.",
  "auth.register.lede":
    "Stiamo raccogliendo case in vista del lancio di settembre 2026. Registrarsi richiede 30 secondi e la tua casa apparirà sopra i risultati standard quando partiranno gli scambi.",
  "auth.register.submit": "Crea account",
  "auth.register.submitting": "Creazione…",
  "auth.register.haveAccount": "Hai già un account?",
  "auth.forgot.title": "Recupera via email.",
  "auth.forgot.lede":
    "Inserisci l'email di registrazione — ti mandiamo un link valido per un'ora.",
  "auth.forgot.submit": "Invia il link",
  "auth.forgot.submitting": "Invio…",
  "auth.forgot.sentTitle": "Link in arrivo.",
  "auth.forgot.sentBody":
    "Se l'email corrisponde a un account, il link è già partito. Vale per un'ora. Non lo trovi? Controlla lo spam e riprova.",
  "auth.forgot.backLogin": "Torna al login",
  "auth.reset.title": "Scegline una nuova.",
  "auth.reset.lede":
    "Scegli una password che non usi altrove. Minimo sei caratteri.",
  "auth.reset.newPassword": "Nuova password",
  "auth.reset.confirm": "Conferma password",
  "auth.reset.submit": "Imposta password",
  "auth.reset.submitting": "Aggiorno…",
  "auth.reset.mismatch": "Le due password non coincidono.",
  "auth.reset.tooShort": "La password deve essere di almeno 6 caratteri.",
  "auth.reset.missingTitle": "Token mancante.",
  "auth.reset.missingBody": "Apri il link dall'email che ti abbiamo mandato, oppure richiedine uno nuovo.",
  "auth.reset.requestLink": "Richiedi un nuovo link",
  "auth.verify.okTitle": "Email confermata.",
  "auth.verify.okBody": "Tutto sbloccato — benvenuto a bordo.",
  "auth.verify.expiredTitle": "Link scaduto.",
  "auth.verify.expiredBody":
    "I link di conferma valgono 7 giorni. Possiamo mandartene uno nuovo.",
  "auth.verify.usedTitle": "Link già usato.",
  "auth.verify.usedBody":
    "Questo link è già stato consumato. La tua email è già confermata.",
  "auth.verify.invalidTitle": "Mmm, questo link non è valido.",
  "auth.verify.invalidBody":
    "Potrebbe essere stato modificato o non essere mai esistito. Richiedine uno nuovo da /account.",
  "auth.verify.toDashboard": "Vai alla dashboard",
  "auth.verify.resend": "Rimanda l'email",
  "auth.verify.resending": "Invio…",
  "auth.verify.resent": "Inviata — controlla la posta",

  // ---- Verify-email banner ----
  "verifyBanner.label": "Conferma",
  "verifyBanner.bodyA": "Conferma l'email a",
  "verifyBanner.bodyB":
    "per sbloccare tutto. Il link nella posta vale 7 giorni.",
  "verifyBanner.resend": "Rimanda email",
  "verifyBanner.sending": "Invio…",
  "verifyBanner.sent": "✓ Email rimandata",

  // ---- Pricing ----
  "pricing.kicker": "Prezzi",
  "pricing.title": "Scambiare casa è gratis.",
  "pricing.titleEm": "Per sempre.",
  "pricing.lede":
    "Non prendiamo una percentuale dello scambio. Paghi solo per le funzioni avanzate — ricerche salvate con avvisi, posizionamento prioritario, account multi-casa, analytics. Lo scambio in sé resta uguale per tutti.",
  "pricing.tags.noFees": "◦ Nessun costo sullo scambio",
  "pricing.tags.noCommission": "◦ Nessuna commissione",
  "pricing.tags.insurance": "◦ Garanzia Swapl in ogni piano",
  "pricing.toggle.monthly": "Mensile",
  "pricing.toggle.yearly": "Annuale · risparmi 30%",
  "pricing.popular": "Più scelto",
  "pricing.cycle.month": "/mese",
  "pricing.cycle.year": "/anno",
  "pricing.billedAnnually": "fatturato annualmente",
  "pricing.cta.getStarted": "Inizia",
  "pricing.cta.upgradePlus": "Passa a Plus",
  "pricing.cta.upgradePro": "Passa a Pro",
  "pricing.legal":
    "Tutti i prezzi in EUR. L'IVA viene mostrata al checkout in base al paese di fatturazione. Disdici quando vuoi — l'accesso continua fino alla fine del periodo corrente.",
  "pricing.manageBilling": "Gestisci abbonamento",
  "pricing.checkoutSoon":
    "Il checkout non è ancora attivo — Stripe verrà acceso al lancio.",
  "pricing.checkoutFailed": "Non sono riuscito ad avviare il checkout.",
  "pricing.loading": "Carico…",

  // ---- Dashboard ----
  "dashboard.greeting": "Ciao",
  "dashboard.title": "La tua dashboard",
  "dashboard.statWaitingOnYou": "In attesa di risposta tua",
  "dashboard.statSentAwaiting": "Inviati — in attesa di risposta",
  "dashboard.statActiveSwaps": "Scambi attivi",
  "dashboard.yourListings": "Le tue case",
  "dashboard.newListing": "+ Nuova casa",
  "dashboard.empty.title": "Ancora nessuna casa.",
  "dashboard.empty.body": "Devi pubblicare una casa prima di poter proporre scambi.",
  "dashboard.empty.cta": "Pubblica casa",
  "dashboard.account": "Account",
  "dashboard.accountSettings": "Impostazioni account",
  "dashboard.signOut": "Esci",
  "dashboard.signedInAs": "Accesso effettuato come",

  // ---- Account ----
  "account.title": "Impostazioni",
  "account.kicker": "Account",
  "account.email": "Email",
  "account.name": "Nome",
  "account.joined": "Iscritto il",
  "account.identityTitle": "Verifica identità",
  "account.identityVerified": "Verificato",
  "account.identityUnverified": "Non verificato",
  "account.identityRequired": "Necessaria prima del primo scambio accettato.",
  "account.identityBlurb":
    "Usiamo un controllo KYC una tantum (passaporto / carta d'identità) all'accettazione della proposta. I tuoi dati non vengono condivisi con l'altro host.",
  "account.interests.title": "I tuoi interessi",
  "account.interests.body":
    "Scegli le cose che ami davvero di un posto — caffè, jazz, surf, vintage, tutto ciò che ti rappresenta. Compaiono sul tuo profilo pubblico e guidano i suggerimenti AI durante lo scambio verso partner che corrispondono ai tuoi gusti.",
  "account.interests.cta": "Modifica interessi",
  "account.savedSearches.title": "Ricerche salvate",
  "account.savedSearches.body":
    "Salva una combinazione di filtri da /listings e ti mandiamo un digest giornaliero delle nuove case che combaciano. I membri Plus e Pro possono salvare fino a 20 ricerche.",
  "account.savedSearches.cta": "Gestisci ricerche salvate",
  "account.notifications.title": "Notifiche",
  "account.notifications.body":
    "L'email è attiva di default per nuove proposte, risposte e scambi accettati. Niente email di marketing.",
  "account.signOut.title": "Esci",
  "account.signOut.cta": "Esci da swapl",

  // ---- Browse + listing ----
  "listings.title": "Case pronte allo scambio",
  "listings.totalSuffix": "case combaciano con i filtri. Il match score si adatta alla tua casa.",
  "listings.matchingAgainst": "Confronto con",
  "listings.listFirst.cta": "Pubblica casa",
  "listings.listFirst.body": "per vedere il match score personalizzato",
  "listings.empty.title": "Nessuna casa con questi filtri.",
  "listings.empty.body": "Allenta un filtro o due — quasi tutte le case sono flessibili sulle date all'interno della finestra.",
  "listings.empty.reset": "Azzera filtri",
  "listings.previous": "← Precedente",
  "listings.next": "Successiva →",
  "listings.pageOf": "Pagina {n} di {total}",
  "listing.about": "Su questa casa",
  "listing.theSpace": "Lo spazio",
  "listing.amenities": "Servizi",
  "listing.available": "Disponibile",
  "listing.hostedBy": "Ospitata da",
  "listing.tradeBlurb":
    "Manda una proposta di scambio con la tua casa allegata. Accettano, rifiutano o controproposta — mai denaro.",
  "listing.editYours": "Modifica",
  "listing.signInToPropose": "Accedi per proporre uno scambio",
  "listing.listFirst": "Pubblica prima la tua casa",
  "listing.proposeSwap": "Proponi scambio",
  "listing.match.title": "Perché potrebbe essere un buon match",

  // ---- Swap thread ----
  "swap.allSwaps": "← Tutti gli scambi",
  "swap.statusLabel": "Proposta ·",
  "swap.original": "Proposta originale",
  "swap.counter": "Controproposta",
  "swap.agreementTitle": "Scambio confermato — chiavi per chiavi",
  "swap.guestCode": "Il codice dei tuoi ospiti (lo useranno a casa tua)",
  "swap.yourCode": "Il tuo codice (lo userai a casa loro)",
  "swap.policyLine":
    "Garanzia {policy} · copertura €{coverage} · linea 24/7: +44 800 000 swap",

  // ---- Common UI ----
  "ui.cancel": "Annulla",
  "ui.save": "Salva",
  "ui.continue": "Continua",
  "ui.back": "Indietro",
  "ui.close": "×",
  "ui.optional": "(facoltativo)",
  "ui.required": "Richiesto",

  // ---- Locale switcher ----
  "locale.label": "Lingua",
  "locale.changeTo": "Cambia in",

  // ---- App showcase ----
  "appShowcase.kicker": "L'app",
  "appShowcase.title": "Il tuo prossimo swap,",
  "appShowcase.titleEm": "in tasca",
  "appShowcase.lede":
    "Sfoglia case verificate, pianifica i viaggi e scrivi ai partner di swap dall'app iOS di Swapl. Ogni schermata qui sotto è vera — catturata direttamente dall'app.",
  "appShowcase.cta": "In arrivo sull'App Store",
  "appShowcase.shot.browse": "Sfoglia le case",
  "appShowcase.shot.detail": "Dettaglio annuncio",
  "appShowcase.shot.trips": "Viaggi",
  "appShowcase.shot.messages": "Messaggi",
  "appShowcase.shot.wishlists": "Wishlist",
};
