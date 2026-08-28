-- Fold Üst/Alt Mesarya into a single MESARYA region (SPEC §4.1).
--
-- The scraper writes 'MESARYA' from here on; these two statements bring the
-- rows written before the change into line. Reads translate the old codes
-- anyway (toRegionCode), so running this is tidying, not a prerequisite.

update duty_shifts set region = 'MESARYA' where region in ('UST_MESARYA', 'ALT_MESARYA');
update pharmacies  set region = 'MESARYA' where region in ('UST_MESARYA', 'ALT_MESARYA');
