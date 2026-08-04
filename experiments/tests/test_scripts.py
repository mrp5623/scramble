from pathlib import Path

from experiments.scripts.train_model1 import next_run_dir


def test_next_run_dir_starts_at_001(tmp_path):
    d = next_run_dir(tmp_path, "ev")
    assert d.name == "run_001_ev" and d.is_dir()


def test_next_run_dir_increments(tmp_path):
    (tmp_path / "run_001_ev").mkdir()
    (tmp_path / "run_007_shuffle").mkdir()
    d = next_run_dir(tmp_path, "shuffle")
    assert d.name == "run_008_shuffle"
