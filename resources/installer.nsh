; Custom NSIS hooks for OpenClaw Desktop installer/uninstaller.
; electron-builder includes this via nsis.include in package.json.

; Before uninstalling: kill any running OpenClaw Desktop process so the
; uninstaller can delete locked files (Windows keeps EXEs locked while running).
!macro customUnInstall
  DetailPrint "Closing OpenClaw Desktop if it is running..."
  nsExec::ExecToLog 'taskkill /F /IM "OpenClaw Desktop.exe" /T'
  Sleep 1500
!macroend
