; OpenCopy NSIS installer hooks
;
; Why: reinstalling over a previous version fails mid-extract with
; "Error opening file for writing: $LOCALAPPDATA\OpenCopy\node.exe"
; because the previous install's bundled Node sidecar is still running and
; holds a file lock — the Windows uninstaller closes the OpenCopy tray app
; but doesn't kill its child Node process.
;
; What: before extract (install + uninstall), force-terminate the OpenCopy
; process tree. /T walks children, so the bundled node.exe sidecar
; (spawned by the Tauri shell) goes down with its parent. We deliberately
; do NOT do a broad `taskkill /IM node.exe` — that would kill unrelated
; Node processes on developer machines.
;
; If a user ever ends up with an orphaned bundled node.exe (parent died
; but child survived — extremely rare), we filter by full executable path
; via PowerShell so we only touch the one under $INSTDIR.
;
; References:
;   https://v2.tauri.app/distribute/windows-installer/#installer-hooks

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping any running OpenCopy instance…"
  !insertmacro StopRunningOpenCopy
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Stopping any running OpenCopy instance…"
  !insertmacro StopRunningOpenCopy
!macroend

!macro StopRunningOpenCopy
  ; Force-kill the OpenCopy process tree. /F = force, /T = whole tree
  ; (parent + bundled node.exe sidecar). Discard exit code — fine if the
  ; process wasn't running.
  nsExec::ExecToLog 'taskkill /F /T /IM "OpenCopy.exe"'
  Pop $0

  ; Backstop for the rare case where the bundled node.exe was orphaned
  ; from its parent. Path-scoped so we never touch unrelated node.exe
  ; processes (e.g. a developer's `next dev` or other apps).
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($\"$INSTDIR$\") } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Pop $0

  ; Give the OS a moment to release file handles before extract begins.
  Sleep 1500
!macroend
