# action-api-sdk CLI 2.0.1

This archive contains an installable Python wheel for the action-api-sdk CLI.
Python 3.9 or newer is required. Runtime dependencies are downloaded by pip.

## Install

```bash
python3 -m pip install ./action_api_sdk-2.0.1-py3-none-any.whl
```

Configure credentials with environment variables or a local `.env` file:

```bash
export MT_AK=your_access_key_here
export MT_SK=your_secret_key_here
```

Do not put real credentials into a package that will be shared.

## Commands

| Command | Purpose | Uploads input | Consumes quota |
| --- | --- | --- | --- |
| `catalog` | Fetch the current server task catalog and discover V2 `material_id` values. | No | No |
| `run-task` | Resolve a task, upload the input to OSS, consume quota, submit the algorithm job, and poll for its result. | Yes | Yes |
| `query-task` | Resume status polling for an existing `task_id`. It does not submit a new job. | No | No |
| `list-tasks` | Print task presets loaded from the current configuration. Prefer `catalog` for authoritative V2 discovery. | No | No |

Fetch the catalog before starting a new task:

```bash
action-api-sdk catalog
action-api-sdk catalog --media-type video
```

For V2 responses, select the matching task and pass its exact `material_id`:

```bash
action-api-sdk run-task --task <material_id> --input /path/to/media
```

Resume an already submitted asynchronous task without uploading or consuming again:

```bash
action-api-sdk query-task --task-id <task_id>
```

The module entry point is also supported:

```bash
python3 -m action_api_sdk.cli --help
```

## Processing pipeline and lower-level interfaces

`run-task` is the supported end-to-end CLI operation:

1. Resolve the task from the remote catalog.
2. Request an upload policy and upload the input with OSS `PutObject`.
3. Call WAPI `POST /skill/consume.json` to consume the required quota.
4. Submit the algorithm job and poll until it completes or fails.

There are no separate `upload` or `consume` CLI commands in 2.0.1. The Python
SDK exposes `SkillClient.api.getFileUrl(...)` for advanced upload-only use. Quota
consumption is intentionally kept inside `SkillClient.run_task(...)`; the internal
consume method is not a stable public API. This prevents accidental quota
consumption without a matching algorithm submission.

## Output and exit status

- Commands write JSON to standard output.
- Exit status `0` means the command completed successfully.
- Exit status `1` means configuration, upload, quota consumption, submission, or
  polling failed.
- Successful task output commonly includes `task_id`, `output_urls`, and the
  server response under `data`.
- Keep the full `task_id`; use `query-task` to continue polling instead of running
  `run-task` again for the same submitted job.

Direct CLI calls default the reported Agent name to `cli`. Host OS, architecture,
language, timezone, Skill version, and Python runtime version are reported as
best-effort telemetry before WAPI request signing.
