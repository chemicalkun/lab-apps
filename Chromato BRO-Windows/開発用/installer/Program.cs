using System.Diagnostics;
using System.Reflection;
using GPCAnalyzer;
namespace ChromatoSetup;
internal static class Program {
 [STAThread]static void Main(string[] args){
  ApplicationConfiguration.Initialize();
  if(args.Length==0&&string.Equals(Path.GetFileName(Environment.ProcessPath),"Uninstall.exe",StringComparison.OrdinalIgnoreCase))args=["--uninstall"];
  if(args.Contains("--uninstall")){
   var temp=Directory.CreateTempSubdirectory("ChromatoBRO-uninstall-").FullName;var copy=Path.Combine(temp,"Uninstall.exe");File.Copy(Environment.ProcessPath!,copy);
   var start=new ProcessStartInfo(copy){UseShellExecute=false};start.ArgumentList.Add("--remove");start.ArgumentList.Add(Environment.ProcessId.ToString());Process.Start(start);return;
  }
  if(args.Length==2&&args[0]=="--remove")try{using var parent=Process.GetProcessById(int.Parse(args[1]));if(!parent.WaitForExit(120000))return;}catch(ArgumentException){}
  using var mutex=new Mutex(true,"Local\\ChromatoBRO.SetupUI",out var first);if(!first){MessageBox.Show("セットアップは既に起動しています。","Chromato BRO");return;}
  Application.Run(new SetupWindow(args.Contains("--remove")));
 }
}
internal sealed class SetupWindow:Form {
 readonly Label status=new(){AutoSize=false};readonly Button install=new(){Text="インストール"};readonly Button cancel=new(){Text="閉じる"};readonly CheckBox desktop=new(){Text="デスクトップにショートカットを作成",Checked=true,AutoSize=true};readonly CheckBox launch=new(){Text="完了後にChromato BROを起動",Checked=true,AutoSize=true};readonly ProgressBar progress=new(){Style=ProgressBarStyle.Marquee};
 readonly bool uninstall;bool busy,done,critical;CancellationTokenSource? cancellation;
 internal SetupWindow(bool uninstall){
  this.uninstall=uninstall;Text=uninstall?"Chromato BRO アンインストール":"Chromato BRO セットアップ";ClientSize=new Size(600,400);FormBorderStyle=FormBorderStyle.FixedDialog;StartPosition=FormStartPosition.CenterScreen;MaximizeBox=false;AutoScaleMode=AutoScaleMode.Dpi;Icon=Icon.ExtractAssociatedIcon(Environment.ProcessPath!);
  BackColor=Color.White;Font=new Font("Yu Gothic UI",10);
  var heading=new Label{Text=uninstall?"Chromato BROを削除します":"Chromato BROをインストール",Font=new Font(Font.FontFamily,18,FontStyle.Bold),ForeColor=Color.FromArgb(20,43,69),Left=24,Top=22,AutoSize=true};
  status.SetBounds(26,76,548,70);status.Text=uninstall?"アプリとショートカットを削除します。\n測定データ・検量線・設定は保持します。":"最新版をダウンロードして、このユーザーのアプリとして導入します。\n測定データ・検量線・設定は引き継がれます。\nインターネット接続が必要です。";
  var locationLabel=new Label{Text="インストール先",Left=26,Top=152,AutoSize=true};var location=new TextBox{Left=26,Top=179,Width=548,ReadOnly=true,Text=Registration.Root};Controls.AddRange([locationLabel,location]);
  desktop.SetBounds(26,220,540,26);launch.SetBounds(26,253,540,26);desktop.Visible=launch.Visible=!uninstall;progress.SetBounds(26,290,548,14);progress.Visible=false;
  install.SetBounds(324,343,120,36);install.BackColor=Color.FromArgb(22,97,204);install.ForeColor=Color.White;install.FlatStyle=FlatStyle.Flat;install.Text=uninstall?"アンインストール":"インストール";cancel.SetBounds(454,343,120,36);
  Controls.AddRange([heading,status,desktop,launch,progress,install,cancel]);AcceptButton=install;
  cancel.Click+=(_,_)=>{if(busy){if(!critical)cancellation?.Cancel();}else Close();};FormClosing+=(_,e)=>{if(busy){e.Cancel=true;if(!critical)cancellation?.Cancel();}};
  install.Click+=async(_,_)=>{if(done){Close();return;}await Run();};
 }
 static void EnsureAppClosed(){if(Mutex.TryOpenExisting("Local\\GPCAnalyzer.Windows",out var existing)){existing.Dispose();throw new IOException("Chromato BROを終了してから、もう一度実行してください。");}}
 async Task Run(){
  busy=true;install.Enabled=false;desktop.Enabled=launch.Enabled=false;progress.Visible=true;cancel.Text="キャンセル";cancellation=new CancellationTokenSource();var token=cancellation.Token;var reporter=new Progress<string>(text=>status.Text=text);string? work=null;
  try{
   EnsureAppClosed();Registration.CheckRoot();
   if(uninstall){
    if(!File.Exists(Registration.Marker))throw new IOException("インストール情報が見つかりません。");
    critical=true;cancel.Enabled=false;status.Text="アンインストール中…";
    await Task.Run(()=>{
     using var guard=new Mutex(false,"Local\\ChromatoBRO.Installation");if(!guard.WaitOne(0))throw new IOException("別のインストール・更新処理を実行中です。");
     try{
      EnsureAppClosed();Registration.CheckRoot();InstallFiles.RequireOrdinaryDirectory(Registration.App);InstallFiles.RequireOrdinaryDirectory(Path.GetDirectoryName(Registration.Uninstaller)!);
      var snapshot=new Registration.Snapshot();var retired=Path.Combine(Registration.Root,".uninstall-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(retired);
      var moved=new List<(string From,string To)>();
      try{
       foreach(var path in new[]{Registration.App,Path.GetDirectoryName(Registration.Uninstaller)!})if(Directory.Exists(path)){var dest=Path.Combine(retired,Path.GetFileName(path));Directory.Move(path,dest);moved.Add((path,dest));}
       Registration.Remove();File.Delete(Registration.Marker);
      }catch{foreach(var pair in moved.AsEnumerable().Reverse())Directory.Move(pair.To,pair.From);snapshot.Restore();throw;}
      InstallFiles.TryDelete(retired);
      if(!Directory.EnumerateFileSystemEntries(Registration.Root).Any())Directory.Delete(Registration.Root);
     }finally{guard.ReleaseMutex();}
    });
    status.Text="アンインストールが完了しました。\n測定データ・検量線・設定は保持されています。";
   }else{
    work=Directory.CreateTempSubdirectory("ChromatoBRO-setup-").FullName;status.Text="最新版を確認中…";
    var feed=Path.Combine(work,"updates.json");await Download.FileAsync(UpdateProtocol.FeedUrl,feed,262144,token,reporter);
    using var key=Assembly.GetExecutingAssembly().GetManifestResourceStream("UpdatePublicKey")??throw new IOException("更新用の公開鍵がありません。");using var memory=new MemoryStream();await key.CopyToAsync(memory,token);
    var release=UpdateProtocol.Decode(await File.ReadAllBytesAsync(feed,token),memory.ToArray(),"windows-x64");
    if(File.Exists(Path.Combine(Registration.App,"Chromato BRO.dll"))){var current=FileVersionInfo.GetVersionInfo(Path.Combine(Registration.App,"Chromato BRO.dll"));if(UpdateProtocol.VersionNumber(current.ProductVersion!.Split('+')[0])>UpdateProtocol.VersionNumber(release.Version)||(UpdateProtocol.VersionNumber(current.ProductVersion!.Split('+')[0])==UpdateProtocol.VersionNumber(release.Version)&&current.FilePrivatePart>release.Build))throw new IOException("既に新しいバージョンがインストールされています。");}
    var zip=Path.Combine(work,"app.zip");await Download.FileAsync(release.Url,zip,release.Size,token,reporter);
    status.Text="ファイルを検証中…";await Task.Run(()=>{UpdateProtocol.VerifyFile(zip,release);UpdateProtocol.Extract(zip,work);},token);
    var candidate=Path.Combine(work,"Chromato BRO Windows");var info=FileVersionInfo.GetVersionInfo(Path.Combine(candidate,"Chromato BRO.dll"));if(info.ProductName!="Chromato BRO"||info.ProductVersion?.Split('+')[0]!=release.Version||info.FilePrivatePart!=release.Build||!File.Exists(Path.Combine(candidate,"Chromato BRO.exe")))throw new IOException("アプリのバージョンを確認できません。");
    if(!RuntimeSupport.Present()){
     if(MessageBox.Show(this,"Chromato BROにはMicrosoft Edge WebView2 Runtimeが必要です。\nMicrosoft公式インストーラを取得して導入しますか？","必要なコンポーネント",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)throw new OperationCanceledException();
     var runtime=Path.Combine(work,"MicrosoftEdgeWebview2Setup.exe");await Download.FileAsync("https://go.microsoft.com/fwlink/p/?LinkId=2124703",runtime,10_000_000,token,reporter);await Task.Run(()=>RuntimeSupport.VerifyMicrosoft(runtime),token);token.ThrowIfCancellationRequested();
     status.Text="Microsoft WebView2のインストール完了を待っています…";using var process=Process.Start(new ProcessStartInfo(runtime,"/install"){UseShellExecute=true})??throw new IOException("WebView2インストーラを起動できません。");await process.WaitForExitAsync();if(!RuntimeSupport.Present())throw new IOException("WebView2 Runtimeの導入が完了していません。");
    }
    token.ThrowIfCancellationRequested();critical=true;cancel.Enabled=false;status.Text="Chromato BROをインストール中…";
    bool createDesktop=desktop.Checked;
    await Task.Run(()=>{
     using var guard=new Mutex(false,"Local\\ChromatoBRO.Installation");if(!guard.WaitOne(0))throw new IOException("別のインストール・更新処理を実行中です。");
     try{
      EnsureAppClosed();Registration.CheckRoot();Directory.CreateDirectory(Registration.Root);InstallFiles.RequireOrdinaryDirectory(Registration.Root);
      var stage=Path.Combine(Registration.Root,".setup-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(stage);
      try{
       var staged=Path.Combine(stage,"App");CopyTree(candidate,staged);var snapshot=new Registration.Snapshot();var previous=Registration.Uninstaller+".previous";
       Directory.CreateDirectory(Path.GetDirectoryName(Registration.Uninstaller)!);
       if(File.Exists(previous))throw new IOException("前回のセットアップの退避ファイルが残っています。");
       bool hadUninstaller=File.Exists(Registration.Uninstaller);if(hadUninstaller)File.Move(Registration.Uninstaller,previous);
       try{
        File.Copy(Environment.ProcessPath!,Registration.Uninstaller);
        InstallFiles.Replace(staged,Registration.App,()=>{try{Registration.Write(release.Version,createDesktop);}catch{snapshot.Restore();throw;}});
        if(hadUninstaller)File.Delete(previous);
       }catch{
        if(File.Exists(Registration.Uninstaller))File.Delete(Registration.Uninstaller);
        if(hadUninstaller&&File.Exists(previous))File.Move(previous,Registration.Uninstaller);
        throw;
       }
      }finally{InstallFiles.TryDelete(stage);}
     }finally{guard.ReleaseMutex();}
    });
    status.Text="インストールが完了しました。\nスタートメニューからChromato BROを起動できます。";
    if(launch.Checked)try{Process.Start(new ProcessStartInfo(Registration.Exe){UseShellExecute=true,WorkingDirectory=Registration.App});}catch(Exception e){MessageBox.Show(this,"インストールは完了しましたが、起動できませんでした。\n"+e.Message,Text);}
   }
   done=true;install.Text="完了";cancel.Visible=false;
  }catch(OperationCanceledException){status.Text="処理を中止しました。アプリのデータは保持されています。";}catch(Exception e){status.Text="処理を完了できませんでした。\n"+e.Message;MessageBox.Show(this,e.Message,Text,MessageBoxButtons.OK,MessageBoxIcon.Error);}finally{if(work!=null)InstallFiles.TryDelete(work);busy=critical=false;progress.Visible=false;install.Enabled=true;desktop.Enabled=launch.Enabled=true;cancel.Enabled=true;cancel.Text="閉じる";cancellation.Dispose();cancellation=null;}
 }
 static void CopyTree(string source,string target){Directory.CreateDirectory(target);foreach(var f in Directory.EnumerateFiles(source))File.Copy(f,Path.Combine(target,Path.GetFileName(f)));foreach(var dir in Directory.EnumerateDirectories(source))CopyTree(dir,Path.Combine(target,Path.GetFileName(dir)));}
}
