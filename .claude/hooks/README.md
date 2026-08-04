# Hooks - Claude Code Automation Configuration

## Description

This folder contains **documentation about Claude Code hooks**. Hooks are configured directly in `.claude/settings.json` and allow you to automate tasks that run at specific moments in the lifecycle of a Claude Code session.

## What They Are For

Hooks are used to:

1. **Automatic cleanup**: Run cleanup tasks at the end of sessions
2. **Automate repetitive tasks**: Run common actions without manual intervention
3. **Maintenance**: Ensure temporary or problematic files are removed
4. **Improve productivity**: Reduce the need for manual intervention

## Structure

```
hooks/
+-- README.md           # This file (hooks documentation)

Note: Hooks are configured in .claude/settings.json, not as separate scripts.
```

## Configured Hooks

Hooks are defined in `.claude/settings.json`. Currently, the project has the following hook configured:

### 1. **Cleanup NUL Files** (Stop Hook)

**Description**: Hook automatically executed at the end of each Claude Code session (`Stop` event).

**Functionality**:
- Removes files named `nul` that may have been accidentally created during development
- Prevents issues on Windows where `nul` is a reserved device name
- Keeps the workspace clean

**When it runs**: Automatically on the Claude Code `Stop` event (session end).

**Current configuration**:
```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -ExecutionPolicy Bypass -File \"c:\\Users\\douglas.paranhos\\Repositories\\EMSA\\common-ai-configs\\.claude\\hooks\\cleanup-nul-files.ps1\""
          }
        ]
      }
    ]
  }
}
```

**Note**: The PowerShell script path above is an EMSA example. Adjust it only if your local EMSA workspace path is different.

## Configuration

### Where to Configure Hooks

Hooks are configured directly in the project file `.claude/settings.json`. It is not necessary to create separate scripts in the `hooks/` folder.

### Configuration Structure

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "command-to-run"
          }
        ]
      }
    ]
  }
}
```

### Available Events

Common Claude Code events where you can configure hooks:

- **`SessionStart`**: Start of a new session
- **`Stop`**: End of a session (when Claude Code is closed)
- **`FileChanged`**: When a file is modified
- **`BeforeCommand`**: Before running a command

See the official Claude Code documentation for the full list of available events.

### Hook Types

- **`command`**: Runs a system command (PowerShell, bash, etc.)
- Other types may be available depending on the Claude Code version

### Example: Add a New Hook

To add a new hook, edit `.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -ExecutionPolicy Bypass -File \"caminho\\para\\script.ps1\""
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started'"
          }
        ]
      }
    ]
  }
}
```

## How It Works

### Execution Flow

1. **An event occurs** (e.g., end of session, start of session, etc.)
2. **Claude Code detects** the event configured in `settings.json`
3. **The system executes** the command configured in the hook
4. **The command performs** the desired action (cleanup, setup, etc.)

### Benefits

- **Automation**: Repetitive tasks run automatically
- **Consistency**: Ensures important actions always happen
- **Productivity**: Reduces manual intervention
- **Maintenance**: Keeps the workspace clean and organized

## Debug

### Verify if the Hook Is Working

1. Check `.claude/settings.json` to confirm the hook is configured
2. Run the action that triggers the event (e.g., close Claude Code to test the `Stop` hook)
3. Verify that the command ran (e.g., check whether `nul` files were removed)

### Test Hook Manually

To test a hook manually, run the command directly:

**Windows PowerShell**:
```powershell
powershell.exe -ExecutionPolicy Bypass -File "caminho\para\script.ps1"
```

**Linux/macOS**:
```bash
bash caminho/para/script.sh
```

### Check Logs

If the hook is not working:
1. Check whether the script path is correct
2. Check execution permissions
3. Test the command manually to identify errors
4. See Claude Code documentation for troubleshooting

## Add New Hooks

To add a new hook:

1. **Edit `.claude/settings.json`** and add the hook configuration
2. **Choose the appropriate event** (`SessionStart`, `Stop`, `FileChanged`, etc.)
3. **Configure the command** to run
4. **Document** the hook purpose and usage in this README.md

### Example: Add a Cleanup Hook

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -ExecutionPolicy Bypass -File \"caminho\\script.ps1\""
          }
        ]
      }
    ]
  }
}
```

### Hook Documentation

**Recommendation**: Document each hook directly in this README.md under "Configured Hooks" instead of creating separate `.md` files for each hook. This keeps all documentation centralized and easy to find.

If a hook becomes very complex and requires extensive documentation, consider creating a separate file. For most cases, documenting in README.md is sufficient.

## Best Practices

1. **Idempotent scripts**: Hooks should be safe to run multiple times without side effects
2. **Performance**: Keep hooks fast; they should not block Claude Code operations
3. **Documentation**: Clearly document the purpose and behavior of each hook in this README.md
4. **Error handling**: Handle errors gracefully without breaking the session
5. **Relative paths**: When possible, use relative paths or environment variables
6. **Version control**: Keep `settings.json` versioned to share hooks with the team

## Why Not Create Separate .md Files?

**Recommendation**: Keep all hook documentation in this single README.md because:

1. **Simplicity**: Hooks are simple `settings.json` configurations and usually do not need extensive docs
2. **Centralization**: All hook information stays in one place
3. **Ease of maintenance**: It is easier to update one file than many
4. **Visibility**: Developers can find everything quickly in one README

**Exception**: If a hook becomes very complex (e.g., script with multiple features, extensive logic), consider creating a separate file for detailed documentation.

## References

- **Configuration**: `.claude/settings.json` - file where hooks are configured
- **CLAUDE.md**: Main repository documentation
- **Claude Code Docs**: Official Claude Code documentation for hooks and configuration

## Important Notes

- **Centralized configuration**: Hooks are configured in `settings.json`, not as separate scripts
- **Paths**: Use absolute or relative paths as needed for your environment
- **Security**: Hooks run with the same user permissions; be careful with executed commands
- **Version control**: Keep `settings.json` versioned to share hooks with the team
- **Portability**: Consider using relative paths or environment variables for better portability across machines
- **Windows**: On Windows, use `powershell.exe` or `cmd.exe` to run commands. `.sh` scripts require Git Bash or WSL
