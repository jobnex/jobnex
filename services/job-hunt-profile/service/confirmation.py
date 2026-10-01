"""Automated preference writes never confirm or replace a confirmed baseline."""
METADATA = {"isConfirmed", "confirmedAt", "lastConfirmedPreferences"}


def pending_preferences(existing, updates):
    values = {key: value for key, value in updates.items() if key not in METADATA}
    if isinstance(values.get("cities"), list):
        values["cities"] = list(dict.fromkeys(values["cities"]))[:3]
    baseline = existing.get("lastConfirmedPreferences")
    if baseline is None:
        baseline = {key: value for key, value in existing.items() if key not in METADATA}
    return existing | values | {"isConfirmed": False, "confirmedAt": existing.get("confirmedAt"),
                                "lastConfirmedPreferences": baseline}


# Merge metadata against the current locked row, not an earlier extraction read.
PENDING_UPDATE = """user_job_preferences.preferences
    || (EXCLUDED.preferences - 'isConfirmed' - 'confirmedAt' - 'lastConfirmedPreferences')
    || jsonb_build_object('isConfirmed', false,
      'confirmedAt', user_job_preferences.preferences->'confirmedAt',
      'lastConfirmedPreferences', COALESCE(
        NULLIF(user_job_preferences.preferences->'lastConfirmedPreferences', 'null'::jsonb),
        user_job_preferences.preferences - 'isConfirmed' - 'confirmedAt' - 'lastConfirmedPreferences'))"""
