; OpenCopy NSIS installer hooks
;
; Symptom this defends against: reinstalling over a previous version fails
; mid-extract with "Error opening file for writing:
; $LOCALAPPDATA\OpenCopy\node.exe" because the previous install's bundled
; Node sidecar is still running and holds a file lock. The Windows
; uninstaller closes the OpenCopy tray app but doesn't kill its child
; Node process.
;
; What this does, before extract (install + uninstall):
;   1) tree-kill OpenCopy.exe (parent + sidecars)
;   2) BROAD kill of all node.exe processes — see tradeoff below
;   3) poll up to 12 s for the OS to release the file lock. If it's still
;      locked we let extract fail with the standard NSIS error rather
;      than busy-wait forever.
;
; Why broad node.exe kill (not path-scoped via PowerShell): NSIS string
; escaping for inline PowerShell is fragile (the escape semantics differ
; between cmd, NSIS, and PowerShell, and the install path can contain
; spaces, slashes, and unicode). A path-scoped kill that flips between
; "works" and "silently no-ops" depending on the install path is worse
; than a broad kill the user understands.
;
; Tradeoff: a developer running an unrelated `node` process during the
; install gets it killed too. Acceptable for OpenCopy's audience —
; non-developer colleagues — and documented in the install log so it's
; never silent.
;
; References:
;   https://v2.tauri.app/distribute/windows-installer/#installer-hooks

!macro NSIS_HOOK_PREINSTALL
  !insertmacro StopRunningOpenCopy install
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro StopRunningOpenCopy uninstall
!macroend

; The `phase` arg makes labels unique per macro expansion, so the
; install + uninstall expansions don't collide on label names.
!macro StopRunningOpenCopy phase
  DetailPrint "OpenCopy: stopping any running instance before ${phase}..."

  ; Pass 1 — tree-kill OpenCopy.exe. /F = force, /T = whole tree
  ; (parent + bundled node.exe sidecar). Exit code 128 means "no
  ; matching process", which is fine.
  nsExec::ExecToLog 'taskkill /F /T /IM "OpenCopy.exe"'
  Pop $0
  DetailPrint "OpenCopy: taskkill OpenCopy.exe -> exit=$0"

  ; Pass 2 — broad kill of node.exe. See file header for rationale.
  nsExec::ExecToLog 'taskkill /F /IM "node.exe"'
  Pop $0
  DetailPrint "OpenCopy: taskkill node.exe -> exit=$0"

  ; Pass 3 — defensive second tree-kill in case Pass 1 raced with a
  ; mid-launch spawn. Idempotent; cheap.
  nsExec::ExecToLog 'taskkill /F /T /IM "OpenCopy.exe"'
  Pop $0

  ; Pass 4 — poll for OpenCopy.exe to become writable. Try to open it
  ; for append; if any process still holds it, FileOpen fails with a
  ; sharing violation and we sleep + retry. Up to 12 attempts at 1 s.
  StrCpy $1 0
  oc_wait_${phase}_loop:
    IntOp $1 $1 + 1
    IntCmp $1 13 oc_wait_${phase}_done

    ; Fresh install (no prior $INSTDIR\OpenCopy.exe) skips the wait.
    IfFileExists "$INSTDIR\OpenCopy.exe" 0 oc_wait_${phase}_done

    ClearErrors
    FileOpen $2 "$INSTDIR\OpenCopy.exe" a
    IfErrors oc_wait_${phase}_held

    ; Got the handle → file is free. Close and proceed.
    FileClose $2
    Goto oc_wait_${phase}_done

  oc_wait_${phase}_held:
    DetailPrint "OpenCopy: file still locked, waiting (attempt $1/12)..."
    Sleep 1000
    Goto oc_wait_${phase}_loop

  oc_wait_${phase}_done:
  DetailPrint "OpenCopy: ready to ${phase}."
!macroend
