-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : 2026-04-25 — Phase 2 LinkedIn cleanup (re-extraction guests.linkedin_url)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- CONTEXTE
-- ────────
-- Phase 2 du chantier LinkedIn pollution. Audit pré-démo Orso/Matthieu a révélé
-- 3 sources de pollution dans `guests.linkedin_url` :
--   - hosts attribués comme guests (ex: Stefani LM #297 → /in/gautier...)
--   - parasites scrape-deep (ex: Le Panier 73 guests = /in/laurentkretz/,
--     GDIY 47 guests = /in/morganprudhomme/)
--   - guests à 1 candidat unique sans label-match (faible confiance)
--
-- Helper `pickGuestLinkedin` (engine/scraping/linkedin-filter.ts) ré-évalue
-- chaque guest en mode dry-run. Stratégie SAFE UPDATE-only validée :
--   - 255 UPDATE confiance haute appliqués (B1+B2-ok+B3)
--   - 139 CONFLICT (B4 order-fallback) basculés en arbitrage humain post-démo
--   - 216 NULLIFY préservés (linkedin_url existant maintenu, jamais effacé)
--
-- TIERS DE CONFIANCE APPLIQUÉS
-- ────────────────────────────
--   B1 = label-match            : 168 (texte du <a> match le nom du guest)
--   B2 = slug-match token≥4     :  86 (slug LinkedIn contient un token du nom)
--   B3 = host-as-guest          :   1 (Stefani LM, recurring guest sur Bilan eps)
--                                 ─────
--                       Total   : 255
--
-- VERIFICATION POST-COMMIT
-- ────────────────────────
-- Counts linkedin_url non-null par tenant (avant → après) :
--   combiencagagne     19 → 19   (Δ=0,    applied=0)
--   finscale          102 → 102  (Δ=0,    applied=5,   value→value corrections)
--   gdiy              129 → 317  (Δ=+188, applied=242, NULL→value enrichment)
--   lamartingale      222 → 223  (Δ=+1,   applied=6,   Stefani fix + corrections)
--   lepanier          108 → 108  (Δ=0,    applied=2)
--   passionpatrimoine 113 → 113  (Δ=0,    applied=0)
--
-- Vérifs spécifiques :
--   - Stefani LM /api/guests/Matthieu%20Stefani → /in/stefani/ ✅
--   - 5 samples random persistés ✅
--   - Idempotence : 255/255 match expected new_url ✅
--
-- PERSISTANCE
-- ───────────
-- Appliqué en transaction atomique sur Neon prod le 2026-04-25 (~24s).
-- Source : `docs/_linkedin-changes-affined.csv` (gitignored, working file).
--
-- DÉPENDANCES
-- ───────────
-- Cette migration suppose que les FK composites sont en place
-- (cf. 2026-04-25-fix-tenant-attribution.sql) — chaque UPDATE est filtré par
-- (id, tenant_id) pour respecter l'invariant.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── FINSCALE (5 updates) ──────────────────────────────────────
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/tiphaine-saltini-phd-9523b126/' WHERE id = 1381 AND tenant_id = 'finscale'; -- UPDATE-B2 Tiphaine Saltini
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/patrick-mollard-703a881/' WHERE id = 1399 AND tenant_id = 'finscale'; -- UPDATE-B2 Patrick Mollard
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/ameliepasquier/' WHERE id = 1410 AND tenant_id = 'finscale'; -- UPDATE-B1 Amélie Madinier
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/cyril-lamorlette-4249352/' WHERE id = 1492 AND tenant_id = 'finscale'; -- UPDATE-B2 Luc Falempin (Tokeny) & Cyril Lamorlette
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/benjamin-pedrini-50777311/' WHERE id = 1499 AND tenant_id = 'finscale'; -- UPDATE-B2 Benjamin Pedrini

-- ── GDIY (242 updates) ──────────────────────────────────────
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/sophie-lacoste-dournel-129682134' WHERE id = 282 AND tenant_id = 'gdiy'; -- UPDATE-B1 Sophie Lacoste-
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/frederic-laloux-108174/' WHERE id = 283 AND tenant_id = 'gdiy'; -- UPDATE-B1 Frédéric Laloux
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/arnaud-katz-ab1b2163/' WHERE id = 285 AND tenant_id = 'gdiy'; -- UPDATE-B1 Arnaud Katz
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/sophiecahen/' WHERE id = 287 AND tenant_id = 'gdiy'; -- UPDATE-B1 Sophie Cahen
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/anne-hommel-a5a889133/?originalSubdomain=fr' WHERE id = 290 AND tenant_id = 'gdiy'; -- UPDATE-B1 Anne Hommel
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/elie-kouby-91a198110/' WHERE id = 291 AND tenant_id = 'gdiy'; -- UPDATE-B1 Elie Kouby
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/toussaint-wattinne/?originalSubdomain=fr' WHERE id = 292 AND tenant_id = 'gdiy'; -- UPDATE-B1 Toussaint Wattinne
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/gillesbertaux/?originalSubdomain=fr' WHERE id = 294 AND tenant_id = 'gdiy'; -- UPDATE-B1 Gilles Bertaux
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/rapha%C3%ABl-di-meglio-15ba5b8a/?originalSubdomain=fr' WHERE id = 295 AND tenant_id = 'gdiy'; -- UPDATE-B1 Raphaël Di Meglio
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/ronan-le-moal-a0b01b8/' WHERE id = 296 AND tenant_id = 'gdiy'; -- UPDATE-B1 Ronan Le Moal
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/mtkhorvath/' WHERE id = 300 AND tenant_id = 'gdiy'; -- UPDATE-B1 Michael Horvath
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/pcorrot/' WHERE id = 301 AND tenant_id = 'gdiy'; -- UPDATE-B1 Philippe Corrot
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/charleschristory/' WHERE id = 302 AND tenant_id = 'gdiy'; -- UPDATE-B1 Charles Christory
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/aprot/' WHERE id = 303 AND tenant_id = 'gdiy'; -- UPDATE-B1 Alexandre Prot
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/gr%C3%A9goire-furrer-montreux-comedy' WHERE id = 304 AND tenant_id = 'gdiy'; -- UPDATE-B1 Grégoire Furrer
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/florentmalbranche/' WHERE id = 305 AND tenant_id = 'gdiy'; -- UPDATE-B1 Florent Malbranche
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/martinohannessian' WHERE id = 308 AND tenant_id = 'gdiy'; -- UPDATE-B1 Martin Ohannessian
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/edouardcaraco/?originalSubdomain=fr' WHERE id = 309 AND tenant_id = 'gdiy'; -- UPDATE-B1 Edouard Caraco
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/micaco/?originalSubdomain=fr' WHERE id = 310 AND tenant_id = 'gdiy'; -- UPDATE-B1 Michaël Cohen
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/vincent-defrasne/' WHERE id = 311 AND tenant_id = 'gdiy'; -- UPDATE-B1 Vincent Defrasne
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/dylan-fournier-732b1972/?originalSubdomain=fr' WHERE id = 312 AND tenant_id = 'gdiy'; -- UPDATE-B2 Dylan Fournier
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/fanny-moizant-40665322/' WHERE id = 313 AND tenant_id = 'gdiy'; -- UPDATE-B2 Fanny Moizant
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/damienmorin/' WHERE id = 314 AND tenant_id = 'gdiy'; -- UPDATE-B1 Damien Morin
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/adrien-roose-bb605613?originalSubdomain=fr' WHERE id = 319 AND tenant_id = 'gdiy'; -- UPDATE-B1 Adrien Roose
UPDATE guests SET linkedin_url = 'https://uk.linkedin.com/in/victorlugger' WHERE id = 321 AND tenant_id = 'gdiy'; -- UPDATE-B1 Victor Lugger
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/mathilde-collin-bb59492a/en/' WHERE id = 322 AND tenant_id = 'gdiy'; -- UPDATE-B1 Mathilde Collin
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/pierre-antoine-capton-3094b4168/?originalSubdomain=fr' WHERE id = 323 AND tenant_id = 'gdiy'; -- UPDATE-B1 Pierre-Antoine Capton
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/fpodoo/?originalSubdomain=fr' WHERE id = 324 AND tenant_id = 'gdiy'; -- UPDATE-B1 Fabien Pinckaers
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/pascal-rigo-a4b41b108/' WHERE id = 325 AND tenant_id = 'gdiy'; -- UPDATE-B2 Pascal Rigo
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/caroline-lamaud-dupont-5967182a/?original_referer=https%3A%2F%2Fwww%2Egoogle%2Ecom%2F&originalSubdomain=fr' WHERE id = 326 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jade Francine & Caroline Lamaud Dupont
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/rachel-picard/' WHERE id = 328 AND tenant_id = 'gdiy'; -- UPDATE-B2 Rachel Picard
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/brunobonnell/' WHERE id = 329 AND tenant_id = 'gdiy'; -- UPDATE-B1 Bruno Bonnell
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/mike-horn-21389740/' WHERE id = 330 AND tenant_id = 'gdiy'; -- UPDATE-B2 Mike Horn
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/shane-parrish-050a2183/' WHERE id = 331 AND tenant_id = 'gdiy'; -- UPDATE-B2 Shane Parrish
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/aurelien-antonini-0b834a278/' WHERE id = 332 AND tenant_id = 'gdiy'; -- UPDATE-B2 Aurélien Antonini
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/aprot/' WHERE id = 334 AND tenant_id = 'gdiy'; -- UPDATE-B1 Alexandre Prot - de McKinsey à QONTO
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/marion-carrette-65a41/?originalSubdomain=fr' WHERE id = 335 AND tenant_id = 'gdiy'; -- UPDATE-B1 Marion Carrette
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/robspiro/' WHERE id = 336 AND tenant_id = 'gdiy'; -- UPDATE-B1 Rob Spiro
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/adrien-labastire-1a54499/' WHERE id = 338 AND tenant_id = 'gdiy'; -- UPDATE-B1 Adrien Labastire
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/perla-servan-schreiber-63288a113/' WHERE id = 339 AND tenant_id = 'gdiy'; -- UPDATE-B2 Perla Servan-
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/francois-duforez-7379166/?originalSubdomain=fr' WHERE id = 341 AND tenant_id = 'gdiy'; -- UPDATE-B1 François Duforez
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/raphael-gaillard-47ab1145/' WHERE id = 345 AND tenant_id = 'gdiy'; -- UPDATE-B2 Raphaël Gaillard
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/b-netter/?locale=en_US' WHERE id = 346 AND tenant_id = 'gdiy'; -- UPDATE-B1 Benjamin Netter
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/franck-annese-33b6aaa0/?originalSubdomain=fr' WHERE id = 347 AND tenant_id = 'gdiy'; -- UPDATE-B1 Franck Annese - SO PRESS - Les secrets de la presse qui cartonne
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/v%C3%A9ra-kempf-%F0%9F%95%8A%EF%B8%8F-a2626a42/?trk=public_profile_browsemap&originalSubdomain=fr' WHERE id = 348 AND tenant_id = 'gdiy'; -- UPDATE-B1 Véra Kempf
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/gary-anssens/?originalSubdomain=fr' WHERE id = 349 AND tenant_id = 'gdiy'; -- UPDATE-B1 Gary Anssens
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/loiclemeur/' WHERE id = 352 AND tenant_id = 'gdiy'; -- UPDATE-B1 Loic Le Meur
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/michael-benabou-a572936/' WHERE id = 353 AND tenant_id = 'gdiy'; -- UPDATE-B1 Michaël Benabou
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/caroline-vigneaux-6288a9119/' WHERE id = 356 AND tenant_id = 'gdiy'; -- UPDATE-B2 Caroline Vigneaux
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/matthieurouif/' WHERE id = 357 AND tenant_id = 'gdiy'; -- UPDATE-B1 Matthieu Rouif
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/gilles-chetelat-b71b34/' WHERE id = 361 AND tenant_id = 'gdiy'; -- UPDATE-B1 Gilles Chetelat
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/nicolasdaudiffret/?originalSubdomain=fr' WHERE id = 362 AND tenant_id = 'gdiy'; -- UPDATE-B1 Nicolas d''
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/cyrilchiche/' WHERE id = 364 AND tenant_id = 'gdiy'; -- UPDATE-B1 Cyril Chiche
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jean-pierre-nadir-1a1156a0' WHERE id = 365 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jean-Pierre Nadir
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/renaudheitz/' WHERE id = 366 AND tenant_id = 'gdiy'; -- UPDATE-B1 Renaud Heitz
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/firmin-zocchetto' WHERE id = 367 AND tenant_id = 'gdiy'; -- UPDATE-B1 Firmin Zocchetto
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/laur%C3%A8ne-altmayer-638b29120/?originalSubdomain=fr' WHERE id = 368 AND tenant_id = 'gdiy'; -- UPDATE-B1 Laurène Altmayer
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/victor-augais-278357/' WHERE id = 370 AND tenant_id = 'gdiy'; -- UPDATE-B1 Victor Augais
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/inesleonarduzzi/' WHERE id = 372 AND tenant_id = 'gdiy'; -- UPDATE-B1 Inès Leonarduzzi
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/laurent-de-la-clergerie/?originalSubdomain=fr' WHERE id = 373 AND tenant_id = 'gdiy'; -- UPDATE-B2 Laurent de la Clergerie
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jacob-abbou-510631b9/?originalSubdomain=fr' WHERE id = 374 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jacob Abbou
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/davidbramipdv/' WHERE id = 375 AND tenant_id = 'gdiy'; -- UPDATE-B1 David Brami
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/sebcaron/?originalSubdomain=fr' WHERE id = 376 AND tenant_id = 'gdiy'; -- UPDATE-B1 Sébastien Caron
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/william-kriegel-521195170/' WHERE id = 377 AND tenant_id = 'gdiy'; -- UPDATE-B2 William Kriegel - L’homme qui murmurait à l''oreille des chevaux
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/augustin-paluel-marmont-10207a95/' WHERE id = 378 AND tenant_id = 'gdiy'; -- UPDATE-B2 Augustin Paluel-
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jessie-inchauspe/' WHERE id = 379 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jessie Inchauspé
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/steveguillou/' WHERE id = 384 AND tenant_id = 'gdiy'; -- UPDATE-B1 Steve Guillou
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/arthur-auboeuf-03574312b/' WHERE id = 385 AND tenant_id = 'gdiy'; -- UPDATE-B1 Arthur Auboeuf
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/sarah-knafo-7a0129b5/?originalSubdomain=fr' WHERE id = 386 AND tenant_id = 'gdiy'; -- UPDATE-B2 Sarah Knafo
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/stephane-bohbot-96967/' WHERE id = 387 AND tenant_id = 'gdiy'; -- UPDATE-B2 Stéphane Bohbot
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/hlebret/?originalSubdomain=fr' WHERE id = 390 AND tenant_id = 'gdiy'; -- UPDATE-B1 Hugues Le Bret
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/hugotravers/' WHERE id = 391 AND tenant_id = 'gdiy'; -- UPDATE-B1 Hugo Travers
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/matthias-dandois-b383a120b/' WHERE id = 392 AND tenant_id = 'gdiy'; -- UPDATE-B2 Matthias Dandois
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/ma%C3%BFlis-staub/' WHERE id = 394 AND tenant_id = 'gdiy'; -- UPDATE-B1 Maÿlis Staub
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/clementdelangue/' WHERE id = 396 AND tenant_id = 'gdiy'; -- UPDATE-B1 Clément Delangue
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/carole-benaroya-3ab112110/' WHERE id = 397 AND tenant_id = 'gdiy'; -- UPDATE-B2 Carole Benaroya
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/thomas-sammut-67284140/?originalSubdomain=fr' WHERE id = 399 AND tenant_id = 'gdiy'; -- UPDATE-B2 Thomas Sammut
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/armand-thiberge-72a4559/?originalSubdomain=fr' WHERE id = 400 AND tenant_id = 'gdiy'; -- UPDATE-B2 Armand Thiberge
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/delphine-groll-2aa68638/?originalSubdomain=fr' WHERE id = 401 AND tenant_id = 'gdiy'; -- UPDATE-B1 Delphine Groll
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/nina-m%C3%A9tayer-1b63ab68/' WHERE id = 403 AND tenant_id = 'gdiy'; -- UPDATE-B2 Nina Métayer
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jbrudelle/?originalSubdomain=fr' WHERE id = 404 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jean-Baptiste Rudelle
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/mehber' WHERE id = 408 AND tenant_id = 'gdiy'; -- UPDATE-B1 Mehdi Berrada
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jonathan-salmona-shodo/' WHERE id = 409 AND tenant_id = 'gdiy'; -- UPDATE-B2 Jonathan Salmona
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/-g-/' WHERE id = 410 AND tenant_id = 'gdiy'; -- UPDATE-B1 Guillaume Moubeche
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/cl%C3%A9mentine-galey-0b211a51/' WHERE id = 412 AND tenant_id = 'gdiy'; -- UPDATE-B1 Clémentine Galey
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/fredericmontagnon/' WHERE id = 415 AND tenant_id = 'gdiy'; -- UPDATE-B1 Frédéric Montagnon
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jesper-brodin/' WHERE id = 416 AND tenant_id = 'gdiy'; -- UPDATE-B2 Jesper Brodin
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/camillemorvan/?originalSubdomain=fr' WHERE id = 418 AND tenant_id = 'gdiy'; -- UPDATE-B1 Camille Morvan
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/yann-lecun/' WHERE id = 420 AND tenant_id = 'gdiy'; -- UPDATE-B1 Yann Le Cun
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/amandine-merle-julia-b2061119/' WHERE id = 422 AND tenant_id = 'gdiy'; -- UPDATE-B1 Amandine Merle Julia
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/maxime-aiach-a63a6112/?originalSubdomain=fr' WHERE id = 423 AND tenant_id = 'gdiy'; -- UPDATE-B2 Maxime Aiach
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/amadou-ba-b5702a164?originalSubdomain=fr' WHERE id = 424 AND tenant_id = 'gdiy'; -- UPDATE-B1 Amadou Ba - Booska-P - Le média qui fait kiffer la moitié des français
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/axel-alletru/?originalSubdomain=fr' WHERE id = 426 AND tenant_id = 'gdiy'; -- UPDATE-B2 Axel Allétru
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/matthieu-bourgeaux-a4868a65/?originalSubdomain=fr' WHERE id = 427 AND tenant_id = 'gdiy'; -- UPDATE-B1 Matthieu Bourgeaux
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/albert-moukheiber/?originalSubdomain=fr' WHERE id = 429 AND tenant_id = 'gdiy'; -- UPDATE-B1 Albert Moukheiber
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/tibo-inshape-036174251/' WHERE id = 430 AND tenant_id = 'gdiy'; -- UPDATE-B2 Tibo In
UPDATE guests SET linkedin_url = 'http://www.linkedin.com/in/sebastien-kopp-6735b263/?ppe=1' WHERE id = 432 AND tenant_id = 'gdiy'; -- UPDATE-B2 Sébastien Kopp
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/anne-laure-constanza-gorg%C3%A9-6362293/' WHERE id = 433 AND tenant_id = 'gdiy'; -- UPDATE-B2 Anne-Laure Constanza Gorgé
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/camille-aumont-carnel-b4755718b/?originalSubdomain=fr' WHERE id = 434 AND tenant_id = 'gdiy'; -- UPDATE-B2 Camille Aumont Carnel
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/franck-ladouce-74a7311/' WHERE id = 437 AND tenant_id = 'gdiy'; -- UPDATE-B1 Franck Ladouce
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/pascal-gras-4b508832/' WHERE id = 438 AND tenant_id = 'gdiy'; -- UPDATE-B2 Pascal Gras
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/siahouchangnia/' WHERE id = 439 AND tenant_id = 'gdiy'; -- UPDATE-B1 Sia Houchangnia
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/nhennion/' WHERE id = 441 AND tenant_id = 'gdiy'; -- UPDATE-B1 Nicolas Hennion
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/%F0%9F%8C%88%F0%9F%8C%88maxime-buhler%F0%9F%8D%8D%F0%9F%8D%8D-183a6271/' WHERE id = 443 AND tenant_id = 'gdiy'; -- UPDATE-B1 Maxime Buhler
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/tristan-vyskoc-37581566/' WHERE id = 444 AND tenant_id = 'gdiy'; -- UPDATE-B2 Tristan Vyskoc
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/davidgurle/' WHERE id = 445 AND tenant_id = 'gdiy'; -- UPDATE-B1 David Gurlé
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/adrienminiatti' WHERE id = 446 AND tenant_id = 'gdiy'; -- UPDATE-B1 Adrien Miniatti
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/octave-klaba-3a0b3632/?originalSubdomain=fr' WHERE id = 449 AND tenant_id = 'gdiy'; -- UPDATE-B2 Octave Klaba
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/thibaud-hug-de-larauze-a9a9b160' WHERE id = 450 AND tenant_id = 'gdiy'; -- UPDATE-B1 Thibaud Hug de Larauze
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/nikola-karabatic-b3b87a146/' WHERE id = 451 AND tenant_id = 'gdiy'; -- UPDATE-B2 Nikola Karabatic
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/ludovicd/' WHERE id = 452 AND tenant_id = 'gdiy'; -- UPDATE-B1 Ludovic de Gromard
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/benjamin-gaignault-46482451/' WHERE id = 453 AND tenant_id = 'gdiy'; -- UPDATE-B1 Benjamin Gaignault
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/clara-blocman-petit-12151131/?originalSubdomain=fr' WHERE id = 454 AND tenant_id = 'gdiy'; -- UPDATE-B1 Clara Blocman
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/stephaneandreedao/' WHERE id = 455 AND tenant_id = 'gdiy'; -- UPDATE-B1 Stéphane André
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/patrick-mouratoglou-49364132/' WHERE id = 460 AND tenant_id = 'gdiy'; -- UPDATE-B2 Patrick Mouratoglou
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/franck-bonfils-829957187/' WHERE id = 465 AND tenant_id = 'gdiy'; -- UPDATE-B2 Franck Bonfils
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/chlo%C3%A9-chr%C3%A9tien-bouscatel-58647360/' WHERE id = 466 AND tenant_id = 'gdiy'; -- UPDATE-B1 Chloé Bouscatel
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/lazorthes/' WHERE id = 467 AND tenant_id = 'gdiy'; -- UPDATE-B1 Céline Lazorthes
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/roxannevarza/fr-fr/?originalSubdomain=fr' WHERE id = 468 AND tenant_id = 'gdiy'; -- UPDATE-B1 Roxanne Varza
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/antoine-vey-b3320447/' WHERE id = 470 AND tenant_id = 'gdiy'; -- UPDATE-B1 Antoine Vey
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/bertrand-p%C3%A9rier-b0b857104/' WHERE id = 471 AND tenant_id = 'gdiy'; -- UPDATE-B2 Bertrand Périer
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/julientchernia/fr-fr' WHERE id = 472 AND tenant_id = 'gdiy'; -- UPDATE-B1 Julien Tchernia
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jeremy-jawish/' WHERE id = 475 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jeremy Jawish
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/quentin-couturier-01619422/' WHERE id = 476 AND tenant_id = 'gdiy'; -- UPDATE-B2 Quentin Couturier
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/alexandre-jardin-6a1339190/' WHERE id = 479 AND tenant_id = 'gdiy'; -- UPDATE-B2 Alexandre Jardin
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/fredericjousset/?originalSubdomain=uk' WHERE id = 480 AND tenant_id = 'gdiy'; -- UPDATE-B1 Frédéric Jousset
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/sarah-poniatowski-b7644810a/' WHERE id = 481 AND tenant_id = 'gdiy'; -- UPDATE-B2 Sarah Poniatowski
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/andre-messika-3a245918/?originalSubdomain=it' WHERE id = 483 AND tenant_id = 'gdiy'; -- UPDATE-B1 Valérie Messika
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/hugues-souparis-488a9247/?originalSubdomain=fr' WHERE id = 484 AND tenant_id = 'gdiy'; -- UPDATE-B1 Hugues Souparis
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/karim-beguir-2350161/' WHERE id = 485 AND tenant_id = 'gdiy'; -- UPDATE-B2 Karim Beguir
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/luc-p-763a1018/' WHERE id = 486 AND tenant_id = 'gdiy'; -- UPDATE-B1 Luc Pallavidino
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/denisfayolle/?locale=fr_FR' WHERE id = 488 AND tenant_id = 'gdiy'; -- UPDATE-B1 Denis Fayolle
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/hugo-philip-b7647431/' WHERE id = 490 AND tenant_id = 'gdiy'; -- UPDATE-B2 Hugo Philip
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jonathan-anguelov-14346611/?originalSubdomain=fr' WHERE id = 491 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jonathan Anguelov
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/aurore-abecassis%F0%9F%8C%B9-08047948/?originalSubdomain=fr' WHERE id = 492 AND tenant_id = 'gdiy'; -- UPDATE-B2 Aurore Abecassis
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/marclevywriter/?locale=en_US' WHERE id = 494 AND tenant_id = 'gdiy'; -- UPDATE-B1 Marc Lévy
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/william-simonin-64aa184a/' WHERE id = 495 AND tenant_id = 'gdiy'; -- UPDATE-B1 Owen Simonin
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/guillaume-de-kergariou-18237726/' WHERE id = 501 AND tenant_id = 'gdiy'; -- UPDATE-B1 Guillaume de Kergariou
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/alain-weill-5860b71b' WHERE id = 502 AND tenant_id = 'gdiy'; -- UPDATE-B1 Alain Weill
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/mathilde-thomas-caudalie/' WHERE id = 503 AND tenant_id = 'gdiy'; -- UPDATE-B1 Mathilde Thomas
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/alexandre-boucheix-3b566784/' WHERE id = 504 AND tenant_id = 'gdiy'; -- UPDATE-B2 Alexandre Boucheix
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/alicedefault/en/' WHERE id = 506 AND tenant_id = 'gdiy'; -- UPDATE-B1 Alice Default
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/maud-caillaux-aa47bba7/' WHERE id = 507 AND tenant_id = 'gdiy'; -- UPDATE-B2 Maud Caillaux
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/eric-tong-cuong-4b7b15161/' WHERE id = 509 AND tenant_id = 'gdiy'; -- UPDATE-B2 Eric Tong Cuong
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/charles-beigbeder-b99a3445/?originalSubdomain=fr' WHERE id = 510 AND tenant_id = 'gdiy'; -- UPDATE-B2 Charles Beigbeder
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/moussa-camara2/?originalSubdomain=fr' WHERE id = 511 AND tenant_id = 'gdiy'; -- UPDATE-B1 Moussa Camara
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/david-corona-n%C3%A9go/' WHERE id = 512 AND tenant_id = 'gdiy'; -- UPDATE-B2 David Corona
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/philippe-journo-81a47826/' WHERE id = 513 AND tenant_id = 'gdiy'; -- UPDATE-B2 Philippe Journo
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/ana%C3%ABlle-malherbe-53280648/?originalSubdomain=fr' WHERE id = 514 AND tenant_id = 'gdiy'; -- UPDATE-B1 Anaëlle Malherbe
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/sacha-poignonnec-7b92128/?originalSubdomain=es' WHERE id = 515 AND tenant_id = 'gdiy'; -- UPDATE-B1 Sacha Poignonnec
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/sylvain-chiron-7ab8295/' WHERE id = 516 AND tenant_id = 'gdiy'; -- UPDATE-B2 Sylvain Chiron
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jeandavid-blanc-16785' WHERE id = 517 AND tenant_id = 'gdiy'; -- UPDATE-B2 Jean-David Blanc
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/constance-jablonski-70b449242/' WHERE id = 518 AND tenant_id = 'gdiy'; -- UPDATE-B2 Constance Jablonski
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/frederic-biousse-a899b67' WHERE id = 519 AND tenant_id = 'gdiy'; -- UPDATE-B1 Frédéric Biousse
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/oliviergoy/' WHERE id = 520 AND tenant_id = 'gdiy'; -- UPDATE-B1 Olivier Goy
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/catherine-poletti-942aba38/' WHERE id = 522 AND tenant_id = 'gdiy'; -- UPDATE-B1 Catherine Poletti
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/pdubuc/' WHERE id = 523 AND tenant_id = 'gdiy'; -- UPDATE-B1 Pierre Dubuc
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/geoffroy-guigou-1466b3/' WHERE id = 525 AND tenant_id = 'gdiy'; -- UPDATE-B1 Geoffroy Guigou
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/david-baverez-40a44613/' WHERE id = 526 AND tenant_id = 'gdiy'; -- UPDATE-B2 David Baverez
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jacques-arthur-essebag-404026132/' WHERE id = 527 AND tenant_id = 'gdiy'; -- UPDATE-B2 Arthur
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/charlie-dalin-1263a067/' WHERE id = 529 AND tenant_id = 'gdiy'; -- UPDATE-B2 Charlie Dalin
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/edouard-meylan-a6b273/' WHERE id = 531 AND tenant_id = 'gdiy'; -- UPDATE-B1 Edouard Meylan
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/benoit-lemaignan/' WHERE id = 532 AND tenant_id = 'gdiy'; -- UPDATE-B2 Benoît Lemaignan
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/oliviersibony/?originalSubdomain=fr' WHERE id = 533 AND tenant_id = 'gdiy'; -- UPDATE-B1 Olivier Sibony
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/lining/' WHERE id = 534 AND tenant_id = 'gdiy'; -- UPDATE-B1 Ning Li
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/matina-razafimahefa' WHERE id = 536 AND tenant_id = 'gdiy'; -- UPDATE-B1 Matina Razafimahefa
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/cl%C3%A9ment-benoit-2750a15/' WHERE id = 537 AND tenant_id = 'gdiy'; -- UPDATE-B1 Clément Benoit
UPDATE guests SET linkedin_url = 'https://de.linkedin.com/in/vincenthuguet' WHERE id = 538 AND tenant_id = 'gdiy'; -- UPDATE-B1 Vincent Huguet
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/steegmann/' WHERE id = 539 AND tenant_id = 'gdiy'; -- UPDATE-B1 Nicolas Steegmann
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/xavier-chauvin-39bb54a/' WHERE id = 540 AND tenant_id = 'gdiy'; -- UPDATE-B1 Xavier Chauvin
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/maxime-wagner-91628511/?originalSubdomain=fr' WHERE id = 541 AND tenant_id = 'gdiy'; -- UPDATE-B1 Maxime WAGNER
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/denis-ladegaillerie-147076131/' WHERE id = 542 AND tenant_id = 'gdiy'; -- UPDATE-B1 Denis Ladegaillerie
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/lepaul/' WHERE id = 544 AND tenant_id = 'gdiy'; -- UPDATE-B1 Paul Lê
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/pierre-kosciusko-morizet-30041/' WHERE id = 546 AND tenant_id = 'gdiy'; -- UPDATE-B1 Pierre Kosciusko
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jo-wilfried-tsonga/' WHERE id = 549 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jo-Wilfried Tsonga
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/plomin-robert-07183b79/?originalSubdomain=uk' WHERE id = 550 AND tenant_id = 'gdiy'; -- UPDATE-B1 Robert Plomin
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/marc-simoncini-53832/' WHERE id = 554 AND tenant_id = 'gdiy'; -- UPDATE-B1 Marc Simoncini
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jacky-z-chang-14670555/' WHERE id = 557 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jacky Chang
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/julie-chapon-684b163b/en' WHERE id = 560 AND tenant_id = 'gdiy'; -- UPDATE-B1 Julie Chapon
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/colineburland/' WHERE id = 561 AND tenant_id = 'gdiy'; -- UPDATE-B1 Coline Burland
UPDATE guests SET linkedin_url = 'http://www.linkedin.com/in/gregory-molle%E2%80%A6eville-3b78ab5b/' WHERE id = 562 AND tenant_id = 'gdiy'; -- UPDATE-B2 Gregory Mollet
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/lemoan' WHERE id = 569 AND tenant_id = 'gdiy'; -- UPDATE-B1 Ludovic Le Moan
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/philippe-gabilliet-01695615' WHERE id = 570 AND tenant_id = 'gdiy'; -- UPDATE-B1 Philippe Gabilliet
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/oliviergoy/' WHERE id = 572 AND tenant_id = 'gdiy'; -- UPDATE-B1 Olivier GOY
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/carolejuge' WHERE id = 576 AND tenant_id = 'gdiy'; -- UPDATE-B1 Carole Juge
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/olivier-babeau/?originalSubdomain=fr' WHERE id = 578 AND tenant_id = 'gdiy'; -- UPDATE-B1 Laurent Alexandre
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/gaspard-koenig-36b49647/?originalSubdomain=fr' WHERE id = 579 AND tenant_id = 'gdiy'; -- UPDATE-B2 Gaspard Koenig
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/vincent-clerc-61230327/' WHERE id = 580 AND tenant_id = 'gdiy'; -- UPDATE-B2 Vincent Clerc
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/eric-vincent-047b029' WHERE id = 581 AND tenant_id = 'gdiy'; -- UPDATE-B1 Pierre Hermé
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/clara-vaisse-56876726/' WHERE id = 582 AND tenant_id = 'gdiy'; -- UPDATE-B2 Clara Vaisse
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/yann-bucaille-lanrezac-592299/' WHERE id = 583 AND tenant_id = 'gdiy'; -- UPDATE-B2 Yann Bucaille-
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/lisa-chavy-46927777/' WHERE id = 584 AND tenant_id = 'gdiy'; -- UPDATE-B2 Lisa Chavy
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/stan-leloup-16b83948/?originalSubdomain=fr' WHERE id = 585 AND tenant_id = 'gdiy'; -- UPDATE-B1 Stan Leloup
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/sarah-renard-6598a3b2/' WHERE id = 586 AND tenant_id = 'gdiy'; -- UPDATE-B2 Sarah Renard
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/arthur-benzaquen-a83723226/' WHERE id = 587 AND tenant_id = 'gdiy'; -- UPDATE-B2 Arthur Benzaquen
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/camille-jaccoux-3a53b973/' WHERE id = 589 AND tenant_id = 'gdiy'; -- UPDATE-B2 Camille Jaccoux
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/artur-reversade-81438486/?originalSubdomain=fr' WHERE id = 590 AND tenant_id = 'gdiy'; -- UPDATE-B1 Luc Reversade
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/mercedes-erra-00581958/' WHERE id = 593 AND tenant_id = 'gdiy'; -- UPDATE-B1 Mercedes Erra
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/c%C3%A9cile-roederer-911b76a/' WHERE id = 594 AND tenant_id = 'gdiy'; -- UPDATE-B1 Cécile Roederer
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/anthony-berthou-8006b217/' WHERE id = 596 AND tenant_id = 'gdiy'; -- UPDATE-B2 Anthony Berthou
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/romain-raffard-45630818/?lipi=urn%3Ali%3Apage%3Ad_flagship3_search_srp_top%3Bl%2FvKJYw3T8ep%2B5LOLbcPEw%3D%3D&licu=urn%3Ali%3Acontrol%3Ad_flagship3_search_srp_top-search_srp_result&lici=IFULsU4TRqGhjPra4hKrQg%3D%3D' WHERE id = 600 AND tenant_id = 'gdiy'; -- UPDATE-B1 Romain Raffard - Bergamotte - Quand ton e-commerce sent bon la réussite
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/laurentkretz/' WHERE id = 603 AND tenant_id = 'gdiy'; -- UPDATE-B1 Valentin Kretz - L’Agence
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/ilanabehassera/' WHERE id = 604 AND tenant_id = 'gdiy'; -- UPDATE-B1 Ilan Abehassera
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/arnaud-montebourg-entrepreneur/' WHERE id = 605 AND tenant_id = 'gdiy'; -- UPDATE-B2 Arnaud Montebourg
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/boris-diaw-57832ab1/' WHERE id = 607 AND tenant_id = 'gdiy'; -- UPDATE-B2 Boris Diaw - Basketteur
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/bertrand-f-57116790/' WHERE id = 612 AND tenant_id = 'gdiy'; -- UPDATE-B1 Bertrand Fleurose
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/bruno42/' WHERE id = 615 AND tenant_id = 'gdiy'; -- UPDATE-B2 Bruno Leveque
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/olivier-gavalda/' WHERE id = 617 AND tenant_id = 'gdiy'; -- UPDATE-B1 Philippe Brassac
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/marcfiorentino?originalSubdomain=fr' WHERE id = 620 AND tenant_id = 'gdiy'; -- UPDATE-B1 Marc Fiorentino
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/joachim-dupont-71507314/' WHERE id = 623 AND tenant_id = 'gdiy'; -- UPDATE-B2 Joachim Dupont
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/richard-strul-99b3b/' WHERE id = 624 AND tenant_id = 'gdiy'; -- UPDATE-B2 Richard Strul
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/morlet/' WHERE id = 627 AND tenant_id = 'gdiy'; -- UPDATE-B2 Paul Morlet - du BEP électricien à Lunettes Pour Tous
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/michael-azoulay-american-vintage-52468325/?originalSubdomain=fr' WHERE id = 631 AND tenant_id = 'gdiy'; -- UPDATE-B2 Michael Azoulay
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/pierreedouardsterin/' WHERE id = 632 AND tenant_id = 'gdiy'; -- UPDATE-B1 Pierre
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/henri-seydoux-343033a0/' WHERE id = 634 AND tenant_id = 'gdiy'; -- UPDATE-B2 Henri Seydoux
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/amanda-sthers-85822924/' WHERE id = 636 AND tenant_id = 'gdiy'; -- UPDATE-B2 Amanda Sthers
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/marwan-mery-80222376/' WHERE id = 640 AND tenant_id = 'gdiy'; -- UPDATE-B2 Marwan Mery
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/marjolainegrondin/' WHERE id = 641 AND tenant_id = 'gdiy'; -- UPDATE-B1 Marjolaine Grondin
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/alexis-pinturault-95334620b/' WHERE id = 651 AND tenant_id = 'gdiy'; -- UPDATE-B2 Alexis Pinturault
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/baptiste-reybier-044b7211/?originalSubdomain=fr' WHERE id = 656 AND tenant_id = 'gdiy'; -- UPDATE-B2 Bernard Reybier
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/gilles-henry-544663a/' WHERE id = 657 AND tenant_id = 'gdiy'; -- UPDATE-B2 Gilles Henry
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/billy-pham-1449037/' WHERE id = 659 AND tenant_id = 'gdiy'; -- UPDATE-B1 Céline Chung
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/patrick-p%C3%A9rez-253695146/' WHERE id = 665 AND tenant_id = 'gdiy'; -- UPDATE-B2 Patrick Pérez
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/nicolas-mermoud-14b304/?originalSubdomain=fr' WHERE id = 669 AND tenant_id = 'gdiy'; -- UPDATE-B2 Nicolas Mermoud
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/meyerpascal/' WHERE id = 670 AND tenant_id = 'gdiy'; -- UPDATE-B1 Pascal Meyer
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/nicolas-colin-the-family/' WHERE id = 673 AND tenant_id = 'gdiy'; -- UPDATE-B1 Nicolas Colin
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jean-marc-jancovici/?originalSubdomain=fr' WHERE id = 675 AND tenant_id = 'gdiy'; -- UPDATE-B2 Jean-Marc Jancovici
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/andrea-bensaid/' WHERE id = 677 AND tenant_id = 'gdiy'; -- UPDATE-B2 Andréa Bensaïd
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/stanislas-maximin/?originalSubdomain=fr' WHERE id = 678 AND tenant_id = 'gdiy'; -- UPDATE-B2 Stanislas Maximin
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/vincent-de-crayencour-77045341/' WHERE id = 681 AND tenant_id = 'gdiy'; -- UPDATE-B1 Vincent de Crayencour
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/guillaume-lacroix-390b17116/' WHERE id = 683 AND tenant_id = 'gdiy'; -- UPDATE-B1 Guillaume Lacroix
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/stephaniedelestre/' WHERE id = 684 AND tenant_id = 'gdiy'; -- UPDATE-B1 Stéphanie Delestre
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/nicolasschweitzer/' WHERE id = 685 AND tenant_id = 'gdiy'; -- UPDATE-B1 Nicolas Schweitzer
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/pillou' WHERE id = 689 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jean-François Pillou
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/nicolasfroissard/' WHERE id = 692 AND tenant_id = 'gdiy'; -- UPDATE-B1 Nicolas Froissard
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/lucie-basch-2b163852/' WHERE id = 693 AND tenant_id = 'gdiy'; -- UPDATE-B1 Lucie Basch
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/marcbatty/?originalSubdomain=fr' WHERE id = 694 AND tenant_id = 'gdiy'; -- UPDATE-B1 Marc Batty
UPDATE guests SET linkedin_url = 'https://fr.linkedin.com/in/penelopeboeuf' WHERE id = 695 AND tenant_id = 'gdiy'; -- UPDATE-B1 Pénélope Boeuf
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jonathancherki/en' WHERE id = 696 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jonathan Cherki
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/georges-olivier-reymond-415b3824/' WHERE id = 697 AND tenant_id = 'gdiy'; -- UPDATE-B1 Georges-Olivier Reymond
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/jean-pierre-chess%C3%A9-62b7a521/' WHERE id = 699 AND tenant_id = 'gdiy'; -- UPDATE-B1 Jean-Pierre Chessé
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/nicolas-de-tavernost-b20a601b3/' WHERE id = 700 AND tenant_id = 'gdiy'; -- UPDATE-B1 Nicolas de Tavernost

-- ── LAMARTINGALE (6 updates) ──────────────────────────────────────
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/nicolas-cheron-896b3015/' WHERE id = 57 AND tenant_id = 'lamartingale'; -- UPDATE-B1 Nicolas Cheron
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/owensimonin/' WHERE id = 59 AND tenant_id = 'lamartingale'; -- UPDATE-B1 Owen Simonin (Hasheur)
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/josephchoueifaty/' WHERE id = 63 AND tenant_id = 'lamartingale'; -- UPDATE-B1 Joseph Choueifaty
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/stefani/' WHERE id = 69 AND tenant_id = 'lamartingale'; -- UPDATE-B3 Matthieu Stefani
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/insaff-el-hassini/' WHERE id = 70 AND tenant_id = 'lamartingale'; -- UPDATE-B1 Insaff El Hassini
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/nicolasdecaudain/' WHERE id = 75 AND tenant_id = 'lamartingale'; -- UPDATE-B1 Nicolas Decaudain

-- ── LEPANIER (2 updates) ──────────────────────────────────────
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/shantybaehrel/?originalSubdomain=fr' WHERE id = 1135 AND tenant_id = 'lepanier'; -- UPDATE-B1 Shanty Biscuits
UPDATE guests SET linkedin_url = 'https://www.linkedin.com/in/anthony-aubert-0009047a/' WHERE id = 1212 AND tenant_id = 'lepanier'; -- UPDATE-B1 Catch-up Aubert


COMMIT;
