Option Explicit
Dim files, shell, root, launcher, command
Set files = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = files.GetParentFolderName(WScript.ScriptFullName)
launcher = files.BuildPath(files.GetParentFolderName(root), "v35-v3-upgrade-20261101\start-review.ps1")
If Not files.FileExists(launcher) Then Err.Raise 53, "V3.5 review", "Review launcher is missing."
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & launcher & """ -OpenReview"
If WScript.Arguments.Named.Exists("Check") Then WScript.Quit 0
shell.Run command, 0, False
