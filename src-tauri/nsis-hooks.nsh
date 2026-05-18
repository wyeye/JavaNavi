!macro JAVANAVI_STOP_JAVA_SIDECAR
  DetailPrint "Stopping JavaNavi Java sidecar before file replacement..."
  nsExec::ExecToLog `powershell -NoProfile -ExecutionPolicy Bypass -Command "$$ErrorActionPreference = 'SilentlyContinue'; $$installDir = [System.IO.Path]::GetFullPath('$INSTDIR'); Get-CimInstance Win32_Process | Where-Object { ($$_.Name -eq 'javaw.exe' -or $$_.Name -eq 'java.exe') -and (($$_.ExecutablePath -and $$_.ExecutablePath.StartsWith(($$installDir + '\resources\java-runtime\bin\'), [System.StringComparison]::OrdinalIgnoreCase)) -or ($$_.CommandLine -like '*javanavi-backend.jar*')) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Sleep 1000
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro JAVANAVI_STOP_JAVA_SIDECAR
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro JAVANAVI_STOP_JAVA_SIDECAR
!macroend
