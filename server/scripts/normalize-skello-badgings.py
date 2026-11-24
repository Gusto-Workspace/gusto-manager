"""Convert a Skello Badgeuse CSV into pseudonymous audit data without writing to Gusto."""

import argparse
import csv
import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


ZONE = ZoneInfo("Europe/Paris")
HEADERS = {
    "ID établissement", "ID utilisateur", "Début prévu", "Fin prévue", "Pause prévue", "Type d'absence",
    "Badge entrée", "Badge sortie", "Pauses", "Durée pause", "Début shift rémunéré", "Fin shift rémunéré", "Pause rémunérée",
}
ABSENCES = {
    "repos hebdomadaire": "weekly_rest", "congé payé": "paid_leave",
    "école - cfa": "apprenticeship", "arrêt maladie": "sick_leave",
}
MAX_SHIFT_MINUTES = 24 * 60


def paris_time(text):
    """Accept only unambiguous civil minutes in the export format."""
    wall = datetime.strptime(text, "%Y-%m-%d %H:%M")
    if wall.strftime("%Y-%m-%d %H:%M") != text:
        raise ValueError("Format d’horodatage invalide")
    valid = set()
    for fold in (0, 1):
        utc = wall.replace(tzinfo=ZONE, fold=fold).astimezone(timezone.utc)
        if utc.astimezone(ZONE).replace(tzinfo=None) == wall:
            valid.add(utc)
    if len(valid) != 1:
        raise ValueError("Heure de Paris ambiguë ou inexistante")
    return valid.pop().astimezone(ZONE)


def elapsed(start, end):
    return int((end.astimezone(timezone.utc) - start.astimezone(timezone.utc)).total_seconds() / 60)


def corrected_paid_end(start, end, planned_in, planned_out, clocked_in, clocked_out):
    """Recognize an overnight planned date carried over to an earlier, same-day checkout."""
    if not all((start, end, planned_in, planned_out, clocked_in, clocked_out)):
        return None
    start_day = start.date()
    next_day = start_day + timedelta(days=1)
    if not (
        elapsed(start, end) > MAX_SHIFT_MINUTES and
        end.date() == planned_out.date() == next_day and
        planned_in.date() == clocked_in.date() == clocked_out.date() == start_day and
        0 < elapsed(planned_in, planned_out) <= MAX_SHIFT_MINUTES and
        0 < elapsed(clocked_in, clocked_out) <= MAX_SHIFT_MINUTES
    ):
        return None
    try:
        candidate = paris_time(f"{start_day} {end:%H:%M}")
    except ValueError:
        return None
    # Require either the exact badge or its nearest five-minute value as corroboration.
    delta = elapsed(clocked_out, candidate)
    if (delta == 0 or (candidate.minute % 5 == 0 and abs(delta) <= 2)) and 0 < elapsed(start, candidate) <= MAX_SHIFT_MINUTES:
        return candidate
    return None


def normalize_service(values, line, employee):
    issues = []

    def read_time(column):
        text = values[column]
        if not text:
            return None
        try:
            return paris_time(text)
        except ValueError:
            issues.append(f"invalid_{column}")
            return None

    def read_pause(column):
        text = values[column]
        if not text:
            return None
        if not text.isascii() or not text.isdecimal() or int(text) > MAX_SHIFT_MINUTES:
            issues.append(f"invalid_{column}")
            return None
        return int(text)

    def duration(start, end, pause, label):
        if not start or not end:
            return None
        gross = elapsed(start, end)
        if not 0 < gross <= MAX_SHIFT_MINUTES or (pause is not None and pause > gross):
            issues.append(f"invalid_{label}_duration")
            return None
        return gross - pause if pause is not None else None

    planned_in = read_time("Début prévu")
    planned_out = read_time("Fin prévue")
    clocked_in = read_time("Badge entrée")
    clocked_out = read_time("Badge sortie")
    paid_in = read_time("Début shift rémunéré")
    original_paid_end = read_time("Fin shift rémunéré")
    planned_break = read_pause("Pause prévue")
    clocked_break = read_pause("Durée pause") if clocked_in or clocked_out else None
    paid_break = read_pause("Pause rémunérée")
    planned = duration(planned_in, planned_out, planned_break, "planned")
    clocked = duration(clocked_in, clocked_out, clocked_break, "clocked")
    candidate = corrected_paid_end(paid_in, original_paid_end, planned_in, planned_out, clocked_in, clocked_out)
    paid_end = candidate or original_paid_end
    paid = duration(paid_in, paid_end, paid_break, "paid")
    if planned is None:
        issues.append("planning_incomplete")
    if paid is None:
        issues.append("payroll_incomplete")
        paid_end = None

    date = (planned_in or paid_in or clocked_in or clocked_out)
    return {
        "employee": employee, "service": f"L{line:04}", "line": line, "date": date.date().isoformat() if date else None,
        "plannedIn": planned_in, "plannedOut": planned_out, "plannedBreak": planned_break, "plannedMinutes": planned,
        "clockedIn": clocked_in, "clockedOut": clocked_out, "clockedBreak": clocked_break, "clockedMinutes": clocked,
        "paidIn": paid_in, "paidOut": paid_end, "paidBreak": paid_break, "paidMinutes": paid,
        "originalPaidOut": values["Fin shift rémunéré"] or None,
        "originalPaidGross": elapsed(paid_in, original_paid_end) if paid_in and original_paid_end else None,
        "paidEndDateCorrected": bool(candidate and paid_end), "hasPauseEvents": bool(values["Pauses"]),
        "badgeStatus": ("complete" if clocked_in and clocked_out else "missing_exit" if clocked_in else
                        "missing_entry" if clocked_out else "invalid" if values["Badge entrée"] or values["Badge sortie"] else "none"),
        "validated": None, "corrections": None, "anomalies": None, "absent": False, "issues": issues,
    }


def read_export(file):
    reader = csv.reader(file, delimiter=";", strict=True)
    headers = next(reader, [])
    if not HEADERS <= set(headers) or len(set(headers)) != len(headers):
        raise ValueError("Colonnes Badgeuse requises absentes ou en double")
    columns = {key: headers.index(key) for key in HEADERS}
    entries = []
    previous_line = reader.line_num
    for row in reader:
        line = previous_line + 1
        previous_line = reader.line_num
        if not row:
            continue
        if len(row) != len(headers):
            raise ValueError(f"Ligne CSV {line} incomplète")
        values = {key: row[column].strip() for key, column in columns.items()}
        if not all(values[key].isascii() and values[key].isdecimal() for key in ("ID établissement", "ID utilisateur")):
            raise ValueError(f"Identifiant d’établissement ou d’utilisateur invalide à la ligne {line}")
        entries.append((line, values))
    venues = {values["ID établissement"] for _, values in entries}
    if len(venues) != 1:
        raise ValueError("L’export doit contenir un seul établissement")
    users = sorted({values["ID utilisateur"] for _, values in entries})
    aliases = {user: f"B{index:02}" for index, user in enumerate(users, 1)}
    services = []
    absences = []
    for line, values in entries:
        employee = aliases[values["ID utilisateur"]]
        absence = values["Type d'absence"].casefold()
        if absence:
            start = values["Début prévu"]
            absences.append({"employee": employee, "line": line, "type": ABSENCES.get(absence, "other"),
                             "date": paris_time(start).date().isoformat() if start else None})
        else:
            services.append(normalize_service(values, line, employee))
    return {"employees": list(aliases.values()), "services": services, "absences": absences}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv")
    args = parser.parse_args()
    try:
        with open(args.csv, encoding="utf-8-sig", newline="") as source:
            result = read_export(source)
    except (OSError, ValueError, csv.Error) as error:
        parser.exit(1, f"{error}\n")
    print(json.dumps(result, default=lambda date: date.isoformat(), ensure_ascii=False))


if __name__ == "__main__":
    main()
