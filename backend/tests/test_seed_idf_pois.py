from seed_idf_pois import split_bbox


def test_split_bbox_3x3_grid_produces_nine_cells() -> None:
    cells = split_bbox("0,0,3,3", cols=3, rows=3)
    assert len(cells) == 9


def test_split_bbox_cells_cover_full_extent_without_gaps() -> None:
    cells = split_bbox("0,0,3,3", cols=3, rows=3)
    parsed = [tuple(float(p) for p in cell.split(",")) for cell in cells]
    lons = sorted({round(p[0], 6) for p in parsed} | {round(p[2], 6) for p in parsed})
    lats = sorted({round(p[1], 6) for p in parsed} | {round(p[3], 6) for p in parsed})
    assert lons == [0.0, 1.0, 2.0, 3.0]
    assert lats == [0.0, 1.0, 2.0, 3.0]


def test_split_bbox_single_cell_returns_original_bbox() -> None:
    cells = split_bbox("1.45,48.12,3.56,49.24", cols=1, rows=1)
    assert cells == ["1.45,48.12,3.56,49.24"]


def test_split_bbox_2x1_grid_splits_on_longitude_only() -> None:
    cells = split_bbox("0,0,4,2", cols=2, rows=1)
    assert cells == ["0,0,2,2", "2,0,4,2"]
