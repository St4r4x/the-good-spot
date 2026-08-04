from poi_dedup import dedupe_pois, normalize_name


def test_normalize_name_strips_accents_and_case() -> None:
    assert normalize_name("Écoles Élémentaire") == "ecoles elementaire"


def test_normalize_name_handles_none() -> None:
    assert normalize_name(None) == ""


def _poi(**kwargs) -> dict:
    base = {
        "lat": 48.85,
        "lon": 2.35,
        "name": "Pharmacie du Village",
        "group": "health",
        "source": "geoapify",
        "osm_id": None,
        "osm_type": None,
    }
    base.update(kwargs)
    return base


def test_dedupe_keeps_single_poi_untouched() -> None:
    pois = [_poi()]
    assert dedupe_pois(pois) == pois


def test_dedupe_matches_by_identical_osm_id() -> None:
    # Geoapify's real payload shape uses the single-letter osm_type ("n"),
    # Overpass's real payload shape uses the full word ("node") — same
    # real-world OSM element, different format per source.
    geoapify_poi = _poi(source="geoapify", osm_id=603506496, osm_type="n")
    overpass_poi = _poi(
        source="overpass",
        osm_id=603506496,
        osm_type="node",
        name="Pharmacie du Village",
    )
    result = dedupe_pois([geoapify_poi, overpass_poi])
    assert len(result) == 1
    assert result[0]["source"] == "geoapify"


def test_dedupe_matches_by_osm_id_when_osm_type_already_matches() -> None:
    geoapify_poi = _poi(source="geoapify", osm_id=603506496, osm_type="w")
    overpass_poi = _poi(
        source="overpass",
        osm_id=603506496,
        osm_type="way",
        name="Pharmacie du Village",
    )
    result = dedupe_pois([geoapify_poi, overpass_poi])
    assert len(result) == 1
    assert result[0]["source"] == "geoapify"


def test_dedupe_by_osm_id_does_not_crash_when_osm_type_missing_on_one_side() -> None:
    geoapify_poi = _poi(source="geoapify", osm_id=603506496, osm_type=None)
    overpass_poi = _poi(
        source="overpass",
        osm_id=603506496,
        osm_type="node",
        name="Pharmacie du Village",
    )
    result = dedupe_pois([geoapify_poi, overpass_poi])
    # osm_id matches but osm_type can't be confirmed on the Geoapify side —
    # treated as not-a-match (no crash), not as a confirmed duplicate.
    assert len(result) == 2


def test_dedupe_matches_by_distance_and_similar_name_when_osm_id_missing() -> None:
    geoapify_poi = _poi(lat=48.8591061, lon=2.3538958, name="Pharmacie du Village")
    overpass_poi = _poi(
        source="overpass",
        lat=48.85911,
        lon=2.35390,
        name="pharmacie du village",
    )
    result = dedupe_pois([geoapify_poi, overpass_poi])
    assert len(result) == 1
    assert result[0]["source"] == "geoapify"


def test_dedupe_keeps_both_when_too_far_apart() -> None:
    geoapify_poi = _poi(lat=48.85, lon=2.35)
    overpass_poi = _poi(source="overpass", lat=48.90, lon=2.40)
    result = dedupe_pois([geoapify_poi, overpass_poi])
    assert len(result) == 2


def test_dedupe_keeps_both_when_names_differ_even_if_close() -> None:
    geoapify_poi = _poi(lat=48.85, lon=2.35, name="Pharmacie du Village")
    overpass_poi = _poi(
        source="overpass", lat=48.85001, lon=2.35001, name="Boulangerie Martin"
    )
    result = dedupe_pois([geoapify_poi, overpass_poi])
    assert len(result) == 2


def test_dedupe_never_compares_across_groups() -> None:
    geoapify_poi = _poi(lat=48.85, lon=2.35, name="Le Central", group="catering")
    overpass_poi = _poi(
        source="overpass", lat=48.85, lon=2.35, name="Le Central", group="commerce"
    )
    result = dedupe_pois([geoapify_poi, overpass_poi])
    assert len(result) == 2
