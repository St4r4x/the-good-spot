import pytest
from poi_tiles import bbox_to_tiles, tile_for_point, tiles_bbox


def test_tile_for_point_floors_to_grid() -> None:
    assert tile_for_point(48.856, 2.352) == (235, 4885)
    assert tile_for_point(-48.856, -2.352) == (-236, -4886)


def test_bbox_to_tiles_single_tile() -> None:
    tiles = bbox_to_tiles("2.350,48.850,2.355,48.855")
    assert tiles == [(235, 4885)]


def test_bbox_to_tiles_multiple_tiles_no_duplicates() -> None:
    tiles = bbox_to_tiles("2.30,48.80,2.32,48.82")
    assert len(tiles) == len(set(tiles))
    assert (230, 4880) in tiles
    assert (231, 4881) in tiles


def test_bbox_to_tiles_covers_exact_boundary() -> None:
    # A bbox exactly on tile boundaries must not spill into an extra tile.
    tiles = bbox_to_tiles("2.00,48.00,2.01,48.01")
    assert set(tiles) == {(200, 4800)}


def test_tiles_bbox_covers_full_extent_of_given_tiles() -> None:
    result = tiles_bbox([(235, 4885), (236, 4886)])
    lon1, lat1, lon2, lat2 = (float(p) for p in result.split(","))
    assert lon1 == pytest.approx(2.35)
    assert lat1 == pytest.approx(48.85)
    assert lon2 == pytest.approx(2.37)
    assert lat2 == pytest.approx(48.87)


def test_tiles_bbox_single_tile() -> None:
    result = tiles_bbox([(235, 4885)])
    assert result == "2.35,48.85,2.36,48.86"
