-- Region backfill for pharmacies the directory join could not match.
-- Generated from two independent signals: the town named at the end of the
-- address, and the region of the geographically nearest known pharmacy.
--
-- Impact is small: the app reads a duty pharmacy's region from
-- duty_shifts.region (taken from the roster heading, which is authoritative).
-- pharmacies.region is only a fallback when that heading cannot be parsed.

-- == Both signals agree (22) — safe to run as-is ==
update pharmacies set region = 'LEFKOSA' where id = 12;  -- AYŞE KAPTAN ECZANESİ
update pharmacies set region = 'LEFKOSA' where id = 39;  -- ECEGÜL ECZANESİ
update pharmacies set region = 'LEFKOSA' where id = 40;  -- ECEM ECZANESİ
update pharmacies set region = 'LEFKOSA' where id = 41;  -- EDA ATAÇAĞ 2 ECZANESİ
update pharmacies set region = 'LEFKOSA' where id = 64;  -- HANDEGÜL GÜNAY ECZANESİ
update pharmacies set region = 'LEFKOSA' where id = 76;  -- KONAK ECZANESİ
update pharmacies set region = 'LEFKOSA' where id = 93;  -- ÖZÜN ECZANESİ
update pharmacies set region = 'LEFKOSA' where id = 100;  -- SENAL ATAÇAĞ ECZANESİ
update pharmacies set region = 'LEFKOSA' where id = 105;  -- SEVAL ECZANESİ
update pharmacies set region = 'GIRNE' where id = 151;  -- EMİN ECZANESİ
update pharmacies set region = 'GIRNE' where id = 177;  -- ÖNCEL MAHMUTOĞLU ECZANESİ
update pharmacies set region = 'GIRNE' where id = 191;  -- TOKAY VARIŞ ECZANESİ
update pharmacies set region = 'GIRNE' where id = 199;  -- ZİBA ECZANESİ
update pharmacies set region = 'GAZIMAGUSA' where id = 229;  -- GÜLGÜN ECZANESİ
update pharmacies set region = 'GAZIMAGUSA' where id = 230;  -- GÜLOĞLU ECZANESİ
update pharmacies set region = 'GAZIMAGUSA' where id = 242;  -- MAĞUSA ECZANESİ
update pharmacies set region = 'GAZIMAGUSA' where id = 262;  -- SÜMER 2 ECZANESİ
update pharmacies set region = 'GAZIMAGUSA' where id = 265;  -- TARABYA ECZANESİ
update pharmacies set region = 'LEFKOSA' where id = 286;  -- KIVANÇ UFUK ECZANESİ
update pharmacies set region = 'LEFKE' where id = 299;  -- SADİYE TAŞAR ECZANESİ
update pharmacies set region = 'ISKELE' where id = 330;  -- SERAKINCI ECZANESİ
update pharmacies set region = 'KARPAZ' where id = 337;  -- GÜRSEL 2 ECZANESİ

-- == Signals disagree or are missing (11) — check before running ==
-- CELISKI: address suggests LEFKOSA, nearest neighbour suggests GIRNE (0.1 km)
--   DERYA ECZANESİ — Mehmet Akif Cad. 53/3 Dereboyu Lefkoşa
-- update pharmacies set region = 'LEFKOSA' where id = 36;

-- TEK SINYAL: address suggests ?, nearest neighbour suggests LEFKOSA (0.0 km)
--   ÖZTEKİNER ECZANESİ — Şht.Ecvet Yusuf Cad.No: 33/C Öztekiner Apt.Yenişehir
-- update pharmacies set region = 'LEFKOSA' where id = 92;

-- TEK SINYAL: address suggests ?, nearest neighbour suggests LEFKOSA (0.2 km)
--   SAĞLIK 2 ECZANESİ — Cengiz Topel Sok.Levent Apt.Blok.38 No:19 K.Çiftlik
-- update pharmacies set region = 'LEFKOSA' where id = 99;

-- TEK SINYAL: address suggests ?, nearest neighbour suggests GIRNE (0.3 km)
--   AYGÜL AYGIN ECZANESİ — Semih Sancar Cad. Nurel 21 Bee Tower Apt. Dük.No:2 Hürdeniz Market karşı Çaprazı
-- update pharmacies set region = 'GIRNE' where id = 140;

-- TEK SINYAL: address suggests ?, nearest neighbour suggests GAZIMAGUSA (0.6 km)
--   ÖZÇAĞ ECZANESİ — 411 İsmet İnönü Bulvarı Salamis Yolu
-- update pharmacies set region = 'GAZIMAGUSA' where id = 252;

-- TEK SINYAL: address suggests ?, nearest neighbour suggests GUZELYURT (0.0 km)
--   DOĞA ECZANESİ — Piyale Paşa Mah.No:121
-- update pharmacies set region = 'GUZELYURT' where id = 277;

-- CELISKI: address suggests LEFKE, nearest neighbour suggests GUZELYURT (4.7 km)
--   FAİKA COŞKUN ECZANESİ — Kalkanlı Cad. No:61/ C Kalkanlı
-- update pharmacies set region = 'LEFKE' where id = 279;

-- CELISKI: address suggests GAZIMAGUSA, nearest neighbour suggests ALT_MESARYA (2.6 km)
--   TURAN CEYDA ECZANESİ — Alt Ekmekçi Sok. No: 8, Gaziköy, Alt Mesarya, Gazimağusa
-- update pharmacies set region = 'GAZIMAGUSA' where id = 319;

-- TEK SINYAL: address suggests LEFKOSA, nearest neighbour suggests ?
--   VİJDAN BAYSAL ECZANESİ — Mustafa Kemal Bulvarı Kıbrıslı Caddesi Lemon Country 34, Apt. No: 2, Minareliköy, Lefkoşa
-- update pharmacies set region = 'LEFKOSA' where id = 373;

-- TEK SINYAL: address suggests LEFKOSA, nearest neighbour suggests ?
--   FAİKA COŞKUN ECZANESİ — Raif Denktaş Caddesi No: 55, Göçmenköy, Lefkoşa
-- update pharmacies set region = 'LEFKOSA' where id = 385;

-- TEK SINYAL: address suggests GIRNE, nearest neighbour suggests ?
--   TULİS ECZANESI — Karaoğlanoğlu Caddesi Yayla Dükkan No: 9, Kapı No: 206, Dima Karşısı Türk Bankası Yanı Alsancak
-- update pharmacies set region = 'GIRNE' where id = 395;

