using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using Microsoft.Win32;
using Forms = System.Windows.Forms;

namespace ReverseCall.Setup {
  internal sealed class Installer {
    private readonly Window window;
    private readonly string preview;
    private bool busy, complete;
    private string installedPath;
    private const long Reserve = 64L * 1024 * 1024;
    private static readonly Assembly Assembly = Assembly.GetExecutingAssembly();

    [STAThread]
    public static int Main(string[] args) {
      Thread.CurrentThread.CurrentCulture = new CultureInfo("ko-KR");
      string preview = args.FirstOrDefault(a => a.StartsWith("--preview", StringComparison.Ordinal)) ?? "";
      bool owned;
      using (var mutex = new Mutex(true, "Local\\SoopketmonSetup-" + BuildConfig.AppGuid + (preview.Length > 0 ? "-preview" : ""), out owned)) {
        var app = new Application();
        var installer = new Installer(preview);
        if (!owned) installer.ShowError("다른 설치창이 열려 있습니다. 먼저 열린 설치창에서 진행해 주세요.");
        if (!owned) installer.C<Button>("InstallButton").IsEnabled = false;
#if INSTALLER_QA
        installer.window.Loaded += async delegate {
          string target = args.FirstOrDefault(a => a.StartsWith("--qa-install="));
          if (target == null) return;
          installer.window.ShowInTaskbar = false;
          installer.window.Hide();
          installer.C<TextBox>("InstallPath").Text = target.Substring(13);
          installer.C<CheckBox>("ShortcutCheck").IsChecked = false;
          await installer.Install();
          File.WriteAllText(Path.Combine(Path.GetDirectoryName(target.Substring(13)), "installer-qa-result.txt"), installer.complete ? "PASS" : installer.C<TextBlock>("Notice").Text);
          installer.window.Close();
        };
#endif
        app.Run(installer.window);
        if (owned) mutex.ReleaseMutex();
        return 0;
      }
    }

    private Installer(string previewMode) {
      preview = previewMode;
      using (var stream = Resource("window.xaml")) window = (Window)XamlReader.Load(stream);
      C<Image>("WorldArt").Source = LoadImage("art.png");
      C<Image>("BrandLogo").Source = LoadImage("logo.png");
      window.Icon = LoadImage("icon.png");
      using (var reader = new StreamReader(Resource("license.txt"), System.Text.Encoding.UTF8, true)) C<TextBox>("LicenseText").Text = reader.ReadToEnd();
      var area = SystemParameters.WorkArea;
      double scale = Math.Min(1, Math.Min((area.Width - 32) / 1040, (area.Height - 32) / 660));
      window.Width = 1040 * scale; window.Height = 660 * scale;
      C<TextBox>("InstallPath").Text = ExistingInstallPath() ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", BuildConfig.DirectoryName);
      C<TextBox>("InstallPath").LostKeyboardFocus += delegate { UpdateSpace(); };
      C<Grid>("TitleBar").MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e) { if (e.OriginalSource is TextBlock || e.OriginalSource is Grid) { try { window.DragMove(); } catch (InvalidOperationException) {} } };
      C<Button>("MinimizeButton").Click += delegate { window.WindowState = WindowState.Minimized; };
      C<Button>("CloseButton").Click += delegate { window.Close(); };
      C<Button>("BrowseButton").Click += delegate { Browse(); };
      C<Button>("InstallButton").Click += async delegate { if (complete) Launch(); else await Install(); };
      C<Button>("InfoButton").Click += delegate { if (complete) window.Close(); else { C<Border>("LicenseOverlay").Visibility = Visibility.Visible; C<Button>("LicenseClose").Focus(); } };
      C<Button>("LicenseClose").Click += delegate { C<Border>("LicenseOverlay").Visibility = Visibility.Collapsed; C<Button>("InfoButton").Focus(); };
      window.PreviewKeyDown += delegate(object sender, KeyEventArgs e) { if (e.Key == Key.Escape && C<Border>("LicenseOverlay").Visibility == Visibility.Visible) { C<Border>("LicenseOverlay").Visibility = Visibility.Collapsed; e.Handled = true; } };
      window.Closing += delegate(object sender, CancelEventArgs e) { if (busy) { e.Cancel = true; ShowError("설치를 마무리하고 있습니다. 완료된 뒤 창을 닫아 주세요."); } };
      UpdateSpace();
      C<TextBlock>("Footer").Text = "WINDOWS 10 / 11 · 인터넷 연결 필요 · v" + BuildConfig.Version;
      if (preview.Length > 0) {
        C<TextBlock>("Footer").Text = "디자인 미리보기 · 설치 및 게임 실행은 진행하지 않습니다";
        if (preview.EndsWith("=complete")) ShowComplete(C<TextBox>("InstallPath").Text);
        else if (preview.EndsWith("=progress")) { ShowInstalling(); Pulse(); C<Button>("CloseButton").IsEnabled = true; }
        else if (preview.EndsWith("=license")) C<Border>("LicenseOverlay").Visibility = Visibility.Visible;
      }
    }

    private T C<T>(string name) where T : class { return (T)window.FindName(name); }
    private static Stream Resource(string name) { return Assembly.GetManifestResourceStream("ReverseCall.Setup." + name); }
    private static BitmapImage LoadImage(string name) {
      using (var stream = Resource(name)) { var image = new BitmapImage(); image.BeginInit(); image.CacheOption = BitmapCacheOption.OnLoad; image.StreamSource = stream; image.EndInit(); image.Freeze(); return image; }
    }
    private static string ExistingInstallPath() {
      using (var root = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry64))
      using (var key = root.OpenSubKey("Software\\" + BuildConfig.AppGuid)) { return key == null ? null : key.GetValue("InstallLocation") as string; }
    }
    private void Browse() {
      using (var dialog = new Forms.FolderBrowserDialog()) {
        dialog.Description = "리버스콜을 설치할 상위 폴더를 선택하세요.";
        dialog.SelectedPath = Directory.Exists(C<TextBox>("InstallPath").Text) ? C<TextBox>("InstallPath").Text : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (dialog.ShowDialog() == Forms.DialogResult.OK) {
          string selected = dialog.SelectedPath;
          if (!String.Equals(Path.GetFileName(selected), BuildConfig.DirectoryName, StringComparison.OrdinalIgnoreCase)) selected = Path.Combine(selected, BuildConfig.DirectoryName);
          C<TextBox>("InstallPath").Text = selected; UpdateSpace();
        }
      }
    }
    private void UpdateSpace() {
      try {
        string selected = C<TextBox>("InstallPath").Text;
        if (selected.StartsWith("\\\\")) throw new IOException();
        var drive = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(selected)));
        C<TextBlock>("SpaceLabel").Text = String.Format("설치 약 {0:N0} MB  ·  남은 공간 {1:N1} GB", Math.Ceiling(BuildConfig.UnpackedBytes / 1048576.0), drive.AvailableFreeSpace / 1073741824.0);
      } catch { C<TextBlock>("SpaceLabel").Text = "설치할 로컬 폴더를 입력해 주세요."; }
    }

    internal static string ValidateTarget(string input, string existing) {
      if (String.IsNullOrWhiteSpace(input) || input.IndexOfAny(new[] {'"', '\r', '\n'}) >= 0) throw new IOException("설치 위치에는 이 PC의 폴더를 입력해 주세요.");
      input = input.Trim();
      if (input.Length < 3 || !Char.IsLetter(input[0]) || input[1] != ':' || (input[2] != '\\' && input[2] != '/')) throw new IOException("드라이브 문자부터 시작하는 전체 설치 경로를 입력해 주세요.");
      string target = Path.GetFullPath(input.Trim()).TrimEnd(Path.DirectorySeparatorChar);
      string root = Path.GetPathRoot(target);
      if (target.Length > 180 || target.Length <= root.TrimEnd('\\').Length || target.IndexOf(':', 2) >= 0) throw new IOException("드라이브 안의 전용 폴더를 설치 위치로 선택해 주세요.");
      foreach (var special in new[] { Environment.SpecialFolder.Windows, Environment.SpecialFolder.ProgramFiles, Environment.SpecialFolder.ProgramFilesX86 }) {
        string system = Environment.GetFolderPath(special).TrimEnd('\\');
        if (system.Length > 0 && (target.Equals(system, StringComparison.OrdinalIgnoreCase) || target.StartsWith(system + "\\", StringComparison.OrdinalIgnoreCase))) throw new IOException("관리자 권한이 필요 없는 개인 폴더를 선택해 주세요.");
      }
      foreach (var special in new[] { Environment.SpecialFolder.UserProfile, Environment.SpecialFolder.DesktopDirectory, Environment.SpecialFolder.MyDocuments, Environment.SpecialFolder.LocalApplicationData })
        if (target.Equals(Environment.GetFolderPath(special).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw new IOException("기존 파일과 구분되는 전용 설치 폴더를 선택해 주세요.");
      if (Directory.Exists(target)) {
        if ((File.GetAttributes(target) & FileAttributes.ReparsePoint) != 0) throw new IOException("연결 폴더 대신 실제 로컬 폴더를 선택해 주세요.");
        if (Directory.EnumerateFileSystemEntries(target).Any() && !target.Equals((existing ?? "").TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw new IOException("다른 파일이 있는 폴더입니다. 비어 있는 전용 폴더를 선택해 주세요.");
      }
      return target;
    }

    private async Task Install() {
      if (busy) return;
      if (preview.Length > 0) { ShowInstalling(); Pulse(); await Task.Delay(1600); ShowComplete(C<TextBox>("InstallPath").Text); return; }
      string target;
      bool shortcut = C<CheckBox>("ShortcutCheck").IsChecked == true;
      try {
        target = ValidateTarget(C<TextBox>("InstallPath").Text, ExistingInstallPath());
        if (Process.GetProcessesByName(Path.GetFileNameWithoutExtension(BuildConfig.ClientExe)).Length > 0 || (BuildConfig.LegacyClientExe.Length > 0 && Process.GetProcessesByName(Path.GetFileNameWithoutExtension(BuildConfig.LegacyClientExe)).Length > 0)) throw new IOException("실행 중인 리버스콜을 종료한 뒤 다시 설치해 주세요.");
        var drive = new DriveInfo(Path.GetPathRoot(target));
        if (!drive.IsReady || drive.DriveType == DriveType.Network) throw new IOException("사용 가능한 로컬 드라이브를 선택해 주세요.");
        long required = BuildConfig.UnpackedBytes + Reserve;
        if (drive.AvailableFreeSpace < required) throw new IOException("설치할 드라이브의 남은 공간이 부족합니다.");
        var tempDrive = new DriveInfo(Path.GetPathRoot(Path.GetTempPath()));
        if (tempDrive.AvailableFreeSpace < BuildConfig.PayloadBytes + Reserve + (drive.Name.Equals(tempDrive.Name, StringComparison.OrdinalIgnoreCase) ? required : 0)) throw new IOException("임시 설치 파일을 준비할 디스크 공간이 부족합니다.");
      } catch (Exception error) { ShowError(error.Message); return; }
      busy = true; ShowInstalling();
      string staging = null;
      try {
        await Task.Run(delegate {
          Directory.CreateDirectory(target);
          using (var probe = new FileStream(Path.Combine(target, ".setup-write-" + Guid.NewGuid().ToString("N")), FileMode.CreateNew, FileAccess.Write, FileShare.None, 1, FileOptions.DeleteOnClose)) {}
          staging = Path.Combine(Path.GetTempPath(), "ReverseCallSetup", Guid.NewGuid().ToString("N"));
          Directory.CreateDirectory(staging);
          string payload = Path.Combine(staging, "install-engine.exe");
          using (var input = Resource("payload.exe"))
          using (var output = new FileStream(payload, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
            byte[] buffer = new byte[1048576]; long copied = 0; int count;
            while ((count = input.Read(buffer, 0, buffer.Length)) > 0) {
              output.Write(buffer, 0, count); copied += count;
              double fraction = (double)copied / BuildConfig.PayloadBytes;
              window.Dispatcher.Invoke(new Action(delegate { C<Border>("ProgressFill").Width = 520 * fraction; C<TextBlock>("ProgressDetail").Text = String.Format("설치 파일 준비  {0:N0} / {1:N0} MB", copied / 1048576.0, BuildConfig.PayloadBytes / 1048576.0); }));
            }
          }
          if (!Hash(payload).Equals(BuildConfig.PayloadHash, StringComparison.OrdinalIgnoreCase)) throw new IOException("설치 파일이 손상되었습니다. 새 설치 파일을 받아 다시 실행해 주세요.");
          window.Dispatcher.Invoke(new Action(delegate { C<TextBlock>("ProgressHeading").Text = "리버스콜을 설치하고 있습니다"; C<TextBlock>("ProgressDetail").Text = "프로그램 파일과 바로가기를 준비합니다. 잠시만 기다려 주세요."; Pulse(); }));
          // NSIS /D must be the last argument and consumes the remaining unquoted path.
          var info = new ProcessStartInfo(payload, "/S --currentuser " + (shortcut ? "" : "--no-desktop-shortcut ") + "/D=" + target) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, WorkingDirectory = staging };
          using (var process = Process.Start(info)) { process.WaitForExit(); if (process.ExitCode != 0) throw new IOException("설치가 완료되지 않았습니다. 오류 코드 " + process.ExitCode + ". 실행 중인 게임을 닫고 다시 시도해 주세요."); }
          if (!File.Exists(Path.Combine(target, BuildConfig.ClientExe)) || !Hash(Path.Combine(target, "resources", "app.asar")).Equals(BuildConfig.AsarHash, StringComparison.OrdinalIgnoreCase)) throw new IOException("설치된 파일 확인에 실패했습니다. 같은 폴더에 다시 설치해 주세요.");
        });
        busy = false; ShowComplete(target);
      } catch (Exception error) {
        busy = false; C<Border>("ProgressFill").BeginAnimation(UIElement.OpacityProperty, null);
        C<StackPanel>("SetupPanel").Visibility = Visibility.Visible; C<StackPanel>("ProgressPanel").Visibility = Visibility.Collapsed;
        C<TextBlock>("Headline").Text = "설치를 마치지\n못했습니다."; C<TextBlock>("Description").Text = "아래 내용을 확인한 뒤 다시 시도해 주세요.";
        C<TextBlock>("ActionLabel").Text = "다시 설치"; SetWorking(false); ShowError(error.Message);
      } finally {
        if (staging != null) { try { File.Delete(Path.Combine(staging, "install-engine.exe")); Directory.Delete(staging, false); } catch {} }
      }
    }

    private static string Hash(string filename) { using (var stream = File.OpenRead(filename)) using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant(); }
    private void SetWorking(bool value) { C<Button>("InstallButton").IsEnabled = !value; C<Button>("CloseButton").IsEnabled = !value; C<Button>("InfoButton").IsEnabled = !value; }
    private void ShowInstalling() {
      C<TextBlock>("Notice").Visibility = Visibility.Collapsed; C<StackPanel>("SetupPanel").Visibility = Visibility.Collapsed; C<StackPanel>("CompletePanel").Visibility = Visibility.Collapsed; C<StackPanel>("ProgressPanel").Visibility = Visibility.Visible;
      C<TextBlock>("StepLabel").Text = "PREPARING YOUR ADVENTURE"; C<TextBlock>("Headline").Text = "당신의 전장을\n준비하는 중.";
      C<TextBlock>("Description").Text = "설치가 끝나면 바로 게임을 시작할 수 있습니다.\n완료될 때까지 이 창을 열어 두세요.";
      C<TextBlock>("ActionLabel").Text = "설치 중"; C<TextBlock>("ProgressHeading").Text = "설치 파일 준비 중"; SetWorking(true);
    }
    private void Pulse() { C<Border>("ProgressFill").Width = 520; C<Border>("ProgressFill").BeginAnimation(UIElement.OpacityProperty, new DoubleAnimation(.35, 1, TimeSpan.FromSeconds(1)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever }); }
    private void ShowComplete(string target) {
      complete = true; installedPath = target;
      C<Border>("ProgressFill").BeginAnimation(UIElement.OpacityProperty, null);
      C<StackPanel>("SetupPanel").Visibility = Visibility.Collapsed; C<StackPanel>("ProgressPanel").Visibility = Visibility.Collapsed; C<StackPanel>("CompletePanel").Visibility = Visibility.Visible;
      C<TextBlock>("Notice").Visibility = Visibility.Collapsed; C<TextBlock>("StepLabel").Text = "READY TO PLAY";
      C<TextBlock>("Headline").Text = "설치 완료.\n이제, 모험의 시간."; C<TextBlock>("Description").Text = "당신의 카드와 용병들이 기다립니다.\n런처에서 게임 시작을 눌러 접속하세요.";
      C<TextBlock>("ActionLabel").Text = "리버스콜 실행"; C<Button>("InfoButton").Content = "닫기"; SetWorking(false);
    }
    private void ShowError(string text) { C<TextBlock>("Notice").Text = text; C<TextBlock>("Notice").Visibility = Visibility.Visible; }
    private void Launch() {
      if (preview.Length > 0) { ShowError("디자인 미리보기에서는 게임을 실행하지 않습니다."); return; }
      try { Process.Start(new ProcessStartInfo(Path.Combine(installedPath, BuildConfig.ClientExe)) { UseShellExecute = true, WorkingDirectory = installedPath }); window.Close(); }
      catch { ShowError("게임 실행에 실패했습니다. 바탕화면의 리버스콜 바로가기로 실행해 주세요."); }
    }
  }
}
