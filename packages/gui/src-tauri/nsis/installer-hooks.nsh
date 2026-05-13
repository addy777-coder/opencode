!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping OpenCode backend before installing..."
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM opencode-server.exe /T /F'
  Pop $0
!macroend
