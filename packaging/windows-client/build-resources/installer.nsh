; The WPF bootstrapper owns every visible installer screen.
; This embedded backend only installs files, shortcuts and the per-user uninstaller.
!macro customHeader
  SilentInstall silent
  AutoCloseWindow true
!macroend
