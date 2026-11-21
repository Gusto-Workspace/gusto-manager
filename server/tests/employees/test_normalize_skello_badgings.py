import csv
import importlib.util
import io
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[2] / "scripts" / "normalize-skello-badgings.py"
SPEC = importlib.util.spec_from_file_location("badgings", SCRIPT)
badgings = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(badgings)


def synthetic(**replacements):
    row = dict.fromkeys(badgings.HEADERS, "")
    row.update({"ID établissement": "1", "ID utilisateur": "2", "Début prévu": "2027-04-17 18:00",
                "Fin prévue": "2027-04-18 01:00", "Pause prévue": "30", "Badge entrée": "2027-04-17 17:58",
                "Badge sortie": "2027-04-17 23:13", "Durée pause": "0", "Début shift rémunéré": "2027-04-17 18:00",
                "Fin shift rémunéré": "2027-04-18 23:15", "Pause rémunérée": "30"})
    row.update(replacements)
    return row


class NormalizeBadgeuseTest(unittest.TestCase):
    def service(self, **replacements):
        return badgings.normalize_service(synthetic(**replacements), 2, "B01")

    def test_corrects_paid_date_with_independent_planned_and_badged_evidence(self):
        row = self.service()
        self.assertTrue(row["paidEndDateCorrected"])
        self.assertEqual(row["originalPaidOut"], "2027-04-18 23:15")
        self.assertEqual(row["originalPaidGross"], 1755)
        self.assertEqual(row["paidOut"].isoformat(), "2027-04-17T23:15:00+02:00")
        self.assertEqual((row["clockedBreak"], row["paidBreak"], row["paidMinutes"]), (0, 30, 285))

    def test_preserves_a_real_overnight_interval_including_a_planned_midnight_boundary(self):
        row = self.service(**{"Fin prévue": "2027-04-18 00:00", "Badge sortie": "2027-04-18 00:08",
                              "Fin shift rémunéré": "2027-04-18 00:10"})
        self.assertFalse(row["paidEndDateCorrected"])
        self.assertEqual(row["paidMinutes"], 340)

    def test_quarantines_overlong_dates_without_independent_evidence(self):
        for changes in ({"Fin prévue": "2027-04-17 23:00"}, {"Badge sortie": ""},
                        {"Badge sortie": "2027-04-17 21:01"}, {"Fin shift rémunéré": "2027-04-19 23:15"}):
            with self.subTest(changes=changes):
                row = self.service(**changes)
                self.assertFalse(row["paidEndDateCorrected"])
                self.assertIsNone(row["paidOut"])
                self.assertIsNone(row["paidMinutes"])
                self.assertIn("invalid_paid_duration", row["issues"])

    def test_incomplete_and_missing_badges_preserve_only_observed_values(self):
        for start, state in (("2027-04-17 18:07", "missing_exit"), ("", "none")):
            row = self.service(**{"Badge entrée": start, "Badge sortie": "", "Fin shift rémunéré": "2027-04-18 00:00"})
            self.assertEqual(row["badgeStatus"], state)
            self.assertIsNone(row["clockedOut"])
            self.assertIsNone(row["clockedMinutes"])
            self.assertEqual(row["clockedBreak"], 0 if start else None)
            self.assertEqual(row["paidMinutes"], 330)

    def test_paris_offsets_measure_elapsed_time_and_reject_ambiguous_wall_times(self):
        start = badgings.paris_time("2027-10-31 01:00")
        end = badgings.paris_time("2027-10-31 04:00")
        self.assertEqual(badgings.elapsed(start, end), 240)
        with self.assertRaises(ValueError):
            badgings.paris_time("2027-10-31 02:15")
        with self.assertRaises(ValueError):
            badgings.paris_time("2027-03-28 02:15")

    def test_day_shift_over_24h_from_fall_back_is_not_shortened_by_a_guess(self):
        row = self.service(**{"Début prévu": "2027-10-30 10:00", "Fin prévue": "2027-10-31 10:00",
                              "Badge entrée": "2027-10-30 10:00", "Badge sortie": "2027-10-31 10:00",
                              "Début shift rémunéré": "2027-10-30 10:00", "Fin shift rémunéré": "2027-10-31 10:00"})
        self.assertFalse(row["paidEndDateCorrected"])
        self.assertEqual(row["originalPaidGross"], 1500)
        self.assertIsNone(row["paidMinutes"])

    def test_wrong_pause_requires_review_and_does_not_produce_minutes(self):
        row = self.service(**{"Pause rémunérée": "500"})
        self.assertIsNone(row["paidMinutes"])
        self.assertIn("invalid_paid_duration", row["issues"])

    def test_csv_links_by_source_id_and_preserves_undated_absence(self):
        stream = io.StringIO(newline="")
        writer = csv.DictWriter(stream, sorted(badgings.HEADERS) + ["Nom"], delimiter=";")
        writer.writeheader()
        writer.writerow(synthetic(Nom="Identité; fictive\nsur deux lignes"))
        stream.write("\n")
        writer.writerow(dict.fromkeys(badgings.HEADERS, "") | {"ID établissement": "1", "ID utilisateur": "2",
                        "Type d'absence": "Congé payé", "Nom": "Alias de test"})
        writer.writerow(synthetic(**{"ID utilisateur": "4", "Nom": "Identité; fictive"}))
        stream.seek(0)
        result = badgings.read_export(stream)
        self.assertEqual(result["employees"], ["B01", "B02"])
        self.assertEqual([row["line"] for row in result["services"]], [2, 6])
        self.assertNotIn("Identité", str(result))
        self.assertEqual(result["absences"], [{"employee": "B01", "line": 5, "type": "paid_leave", "date": None}])


if __name__ == "__main__":
    unittest.main()
