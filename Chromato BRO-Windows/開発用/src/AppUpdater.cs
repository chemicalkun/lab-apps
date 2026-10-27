using System.Diagnostics;
using System.Net;
using System.Text.Json;
namespace GPCAnalyzer;
internal sealed class AppUpdater {
 readonly Form owner;readonly string status;
 bool busy;string? pendingWork,pendingCandidate;
 internal AppUpdater(Form owner,string dataFolder){this.owner=owner;status=Path.Combine(dataFolder,"update-status.txt");}
 void Message(string title,string text)=>MessageBox.Show(owner,text,title,MessageBoxButtons.OK,MessageBoxIcon.Information);
 async Task Fetch(Uri url,string output,long limit,CancellationToken token){
  using var handler=new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false,AutomaticDecompression=DecompressionMethods.None};using var client=new HttpClient(handler){Timeout=TimeSpan.FromMinutes(10)};
  for(var i=0;i<10;i++){
   using var response=await client.GetAsync(url,HttpCompletionOption.ResponseHeadersRead,token);
   if((int)response.StatusCode is 301 or 302 or 303 or 307 or 308){url=UpdateProtocol.HttpsUrl(new Uri(url,response.Headers.Location??throw new IOException("転送先が不正です。")).AbsoluteUri);continue;}
   if(response.StatusCode!=HttpStatusCode.OK||response.Content.Headers.ContentLength>limit)throw new IOException("更新ファイルを取得できませんでした。配布URLと接続を確認してください。");
   await using var input=await response.Content.ReadAsStreamAsync(token);await using var file=new FileStream(output,FileMode.CreateNew,FileAccess.Write,FileShare.None,81920,true);
   var buffer=new byte[81920];long total=0;int count;while((count=await input.ReadAsync(buffer,token))>0){total+=count;if(total>limit)throw new IOException("更新ファイルが大きすぎます。");await file.WriteAsync(buffer.AsMemory(0,count),token);}return;
  }
  throw new IOException("配布URLの転送回数が多すぎます。");
 }
 async Task<T> WithProgress<T>(string text,Func<CancellationToken,Task<T>> action){
  using var cancel=new CancellationTokenSource();using var dialog=new Form{Text="Chromato BRO アップデート",ClientSize=new Size(420,128),StartPosition=FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.FixedDialog,ControlBox=false};
  var label=new Label{Text=text,Left=16,Top=16,Width=388,Height=32};var bar=new ProgressBar{Style=ProgressBarStyle.Marquee,Left=16,Top=50,Width=388};var button=new Button{Text="キャンセル",Left=308,Top=88,Width=96};button.Click+=(_,_)=>{button.Enabled=false;cancel.Cancel();};dialog.Controls.AddRange([label,bar,button]);dialog.Show(owner);owner.Enabled=false;
  try{return await action(cancel.Token);}finally{owner.Enabled=true;dialog.Close();owner.Activate();}
 }
 internal async Task Check(){
  if(busy||pendingWork!=null)return;string? temp=null,work=null;bool keep=false;
  try{
   var uri=UpdateProtocol.HttpsUrl(UpdateProtocol.FeedUrl);busy=true;temp=Path.Combine(Path.GetTempPath(),"ChromatoBRO-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temp);
   var manifest=Path.Combine(temp,"updates.json");await WithProgress("アップデートを確認中…",async token=>{await Fetch(uri,manifest,262144,token);return true;});
   var release=UpdateProtocol.Decode(await File.ReadAllBytesAsync(manifest),File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory,"update-public.der")),"windows-x64");
   var version=Application.ProductVersion.Split('+')[0];var build=FileVersionInfo.GetVersionInfo(typeof(Program).Assembly.Location).FilePrivatePart;
   if(!UpdateProtocol.Newer(release,version,build)){Message("最新版を使用しています","現在のバージョン：ver"+version);return;}
   if(MessageBox.Show(owner,release.Notes+"\n\nダウンロード後、データを保存して再起動します。","ver"+release.Version+" に更新できます",MessageBoxButtons.OKCancel,MessageBoxIcon.Information)!=DialogResult.OK)return;
   var archive=Path.Combine(temp,"update.zip");await WithProgress("アップデートをダウンロード中…",async token=>{await Fetch(UpdateProtocol.HttpsUrl(release.Url),archive,release.Size,token);return true;});
   var target=Path.TrimEndingDirectorySeparator(AppContext.BaseDirectory);
   if((File.GetAttributes(target)&FileAttributes.ReparsePoint)!=0)throw new IOException("リンク経由の保存先には更新できません。アプリを通常のフォルダに移動してください。");
   work=Path.Combine(Path.GetDirectoryName(target)!,".ChromatoBRO-update-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(work);
   var candidate=Path.Combine(work,"Chromato BRO Windows");
   await WithProgress("更新ファイルを検証中…",token=>Task.Run(()=>{
    token.ThrowIfCancellationRequested();UpdateProtocol.VerifyFile(archive,release);UpdateProtocol.Extract(archive,work);token.ThrowIfCancellationRequested();
    var exe=Path.Combine(candidate,"Chromato BRO.exe");var dll=Path.Combine(candidate,"Chromato BRO.dll");
    var product=FileVersionInfo.GetVersionInfo(dll);if(product.ProductName!="Chromato BRO"||product.ProductVersion?.Split('+')[0]!=release.Version||product.FilePrivatePart!=release.Build||!File.Exists(exe)||!File.Exists(Path.Combine(candidate,"www","index.html")))throw new IOException("更新アプリの識別情報が一致しません。");
    CopyTree(target,Path.Combine(work,"helper"));return true;
   },token));
   if(MessageBox.Show(owner,"測定データ・検量線・設定を保存して再起動します。","更新の準備ができました",MessageBoxButtons.OKCancel,MessageBoxIcon.Information)==DialogResult.OK){pendingWork=work;pendingCandidate=candidate;keep=true;owner.Close();}
  }catch(OperationCanceledException){}catch(Exception e){Message("更新できませんでした",e.Message);}finally{busy=false;if(temp!=null)TryDelete(temp);if(work!=null&&!keep)TryDelete(work);}
 }
 internal void StartPending(){
  if(pendingWork==null||pendingCandidate==null)return;
  Directory.CreateDirectory(Path.GetDirectoryName(status)!);
  var info=new ProcessStartInfo(Path.Combine(pendingWork,"helper","Chromato BRO.exe")){UseShellExecute=false,WorkingDirectory=pendingWork};
  foreach(var arg in new[]{"--install-update",Environment.ProcessId.ToString(),Path.TrimEndingDirectorySeparator(AppContext.BaseDirectory),pendingCandidate,pendingWork,status})info.ArgumentList.Add(arg);
  _=Process.Start(info)??throw new IOException("更新ヘルパーを起動できません。");pendingWork=null;pendingCandidate=null;
 }
 internal void CancelPending(){if(pendingWork!=null)TryDelete(pendingWork);pendingWork=null;pendingCandidate=null;}
 internal void ConfirmLaunch(){
  // A previous helper cannot delete its own running runtime on Windows.
  // Remove only completed update workspaces on a later normal launch.
  if(!Environment.GetCommandLineArgs().Contains("--update-confirm")){
   var parent=Path.GetDirectoryName(Path.TrimEndingDirectorySeparator(AppContext.BaseDirectory));
   if(parent!=null)foreach(var old in Directory.EnumerateDirectories(parent,".ChromatoBRO-update-*"))if(File.Exists(Path.Combine(old,"completed")))TryDelete(old);
  }
  var args=Environment.GetCommandLineArgs();var i=Array.IndexOf(args,"--update-confirm");if(i>=0&&args.Length>i+1){var path=args[i+1];if(Path.GetFileName(path)=="ready"&&Path.GetFileName(Path.GetDirectoryName(path)!).StartsWith(".ChromatoBRO-update-",StringComparison.Ordinal))File.WriteAllText(path,"ready");}
  if(File.Exists(status)){var text=File.ReadAllText(status);File.Delete(status);Message("アップデート",text);}
 }
 static void CopyTree(string source,string target){
  Directory.CreateDirectory(target);
  foreach(var path in Directory.EnumerateFiles(source)){if((File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0)throw new IOException("リンクを含むアプリは更新できません。");File.Copy(path,Path.Combine(target,Path.GetFileName(path)));}
  foreach(var path in Directory.EnumerateDirectories(source)){if((File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0)throw new IOException("リンクを含むアプリは更新できません。");CopyTree(path,Path.Combine(target,Path.GetFileName(path)));}
 }
 static void TryDelete(string path){try{Directory.Delete(path,true);}catch{}}
 internal static void Install(string[] args){
  // Runs from a copied runtime after the original process has saved and exited.
  if(args.Length!=6)throw new IOException("更新引数が不正です。");
  var target=args[2];var candidate=args[3];var work=args[4];var status=args[5];var backup=target+".update-backup";var ready=Path.Combine(work,"ready");
  try{try{using var parent=Process.GetProcessById(int.Parse(args[1]));if(!parent.WaitForExit(120000))return;}catch(ArgumentException){}
   if(Directory.Exists(backup))throw new IOException("前回の更新バックアップが残っています。アプリは変更しませんでした。");
   Directory.Move(target,backup);
   try{
    Directory.Move(candidate,target);var info=new ProcessStartInfo(Path.Combine(target,"Chromato BRO.exe")){UseShellExecute=false,WorkingDirectory=target};info.ArgumentList.Add("--update-confirm");info.ArgumentList.Add(ready);
    using var child=Process.Start(info)??throw new IOException("更新後のアプリを起動できません。");
    for(var i=0;i<120;i++){if(File.Exists(ready)){TryDelete(backup);if(File.Exists(status))File.Delete(status);File.WriteAllText(Path.Combine(work,"completed"),"ready");return;}if(child.HasExited)throw new IOException("更新後のアプリが終了しました。");Thread.Sleep(500);}
    File.WriteAllText(status,"更新後の起動確認を完了できませんでした。以前の版は .update-backup に保持しています。");
   }catch{
    if(Directory.Exists(target))Directory.Move(target,Path.Combine(work,"failed"));Directory.Move(backup,target);
    File.WriteAllText(status,"更新を完了できなかったため、以前のアプリに戻しました。");Process.Start(new ProcessStartInfo(Path.Combine(target,"Chromato BRO.exe")){UseShellExecute=true,WorkingDirectory=target});
   }
  }catch(Exception e){Directory.CreateDirectory(Path.GetDirectoryName(status)!);File.WriteAllText(status,"更新できませんでした。\n"+e.Message);MessageBox.Show(e.Message,"Chromato BRO アップデート",MessageBoxButtons.OK,MessageBoxIcon.Error);}
 }
}
