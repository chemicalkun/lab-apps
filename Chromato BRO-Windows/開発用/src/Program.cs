using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text;
using System.Text.Json;
namespace GPCAnalyzer;
internal static class Program {
 [STAThread] static void Main(string[] args) {
  if(args.Length>0&&args[0]=="--install-update"){AppUpdater.Install(args);return;}
  ApplicationConfiguration.Initialize();
  using var mutex=new Mutex(true,"Local\\GPCAnalyzer.Windows",out var first);
  if(!first){MessageBox.Show("Chromato BROは既に起動しています。タスクバーから開いてください。","Chromato BRO");return;}
  try{Application.Run(new MainWindow());}catch(Exception e){MessageBox.Show(e.Message,"Chromato BRO",MessageBoxButtons.OK,MessageBoxIcon.Error);}
 }
}
internal sealed class MainWindow:Form {
 const string Origin="https://gpc-analyzer.invalid";
 readonly WebView2 web=new(){Dock=DockStyle.Fill};
 readonly SessionStore store;
 readonly AppUpdater updater;
 readonly string dataFolder;
 bool ready,canClose,closing;
 public MainWindow(){
  Text="Chromato BRO";ClientSize=new Size(1280,850);MinimumSize=new Size(860,650);StartPosition=FormStartPosition.CenterScreen;
  Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
  dataFolder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"GPCAnalyzer");store=new SessionStore(dataFolder);
  updater=new AppUpdater(this,dataFolder);
  Controls.Add(web);var menu=new MenuStrip();MainMenuStrip=menu;Controls.Add(menu);
  var file=new ToolStripMenuItem("ファイル");menu.Items.Add(file);
  Add(file,"開く…",Keys.Control|Keys.O,"window.GPCUI?.openFile()");Add(file,"保存…",Keys.Control|Keys.S,"window.GPCUI?.saveDocument()");file.DropDownItems.Add("終了",null,(_,_)=>Close());
  var edit=new ToolStripMenuItem("編集");menu.Items.Add(edit);
  Add(edit,"コピー",Keys.Control|Keys.C,"document.execCommand('copy')");Add(edit,"貼り付け",Keys.Control|Keys.V,"document.execCommand('paste')");Add(edit,"全て選択",Keys.Control|Keys.A,"document.execCommand('selectAll')");
  var view=new ToolStripMenuItem("表示");menu.Items.Add(view);
  Add(view,"分子量計算",Keys.Control|Keys.D1,"document.getElementById('navAnalysis').click()");Add(view,"検量線作成",Keys.Control|Keys.D2,"document.getElementById('navCalibration').click()");Add(view,"概形表示",Keys.Control|Keys.D3,"document.getElementById('navGraph').click()");
  Add(view,"全体表示",Keys.Control|Keys.D0,"document.getElementById(document.getElementById('graphPage').hidden?'resetView':'graphReset').click()");
  var help=new ToolStripMenuItem("ヘルプ");menu.Items.Add(help);Add(help,"操作ガイド",Keys.F1,"window.GPCUI.showHelp()");help.DropDownItems.Add("Chromato BROについて",null,(_,_)=>MessageBox.Show($"Chromato BRO\nバージョン {Application.ProductVersion.Split('+')[0]}\n\nGPC/SECデータ解析ソフトウェア\n対応形式：CRM / CSV / ANL","Chromato BRO",MessageBoxButtons.OK,MessageBoxIcon.Information));
  help.DropDownItems.Add("アップデートを確認…",null,async(_,_)=>{if(ready)await updater.Check();else MessageBox.Show("画面の読み込みが完了してからお試しください。","Chromato BRO");});
  Shown+=async(_,_)=>await Initialize();FormClosing+=OnCloseRequested;
 }
 void Add(ToolStripMenuItem parent,string label,Keys keys,string script){var item=new ToolStripMenuItem(label){ShortcutKeys=keys};item.Click+=async(_,_)=>{if(ready)await web.ExecuteScriptAsync(script);};parent.DropDownItems.Add(item);}
 async Task Initialize(){try{
  var bootstrap=new Dictionary<string,object?>();try{var session=store.Load();if(session!=null)bootstrap["session"]=session;}catch(Exception e){bootstrap["error"]="保存データを復元できません："+e.Message;}
  var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(dataFolder,"WebView2"));await web.EnsureCoreWebView2Async(env);
  var core=web.CoreWebView2;core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.IsStatusBarEnabled=false;
  core.SetVirtualHostNameToFolderMapping("gpc-analyzer.invalid",Path.Combine(AppContext.BaseDirectory,"www"),CoreWebView2HostResourceAccessKind.DenyCors);
  core.NavigationStarting+=(_,e)=>{if(!Allowed(e.Uri))e.Cancel=true;};core.NewWindowRequested+=(_,e)=>e.Handled=true;core.PermissionRequested+=(_,e)=>e.State=CoreWebView2PermissionState.Deny;
  core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
  core.WebResourceRequested+=(_,e)=>{if(!Allowed(e.Request.Uri)&&!e.Request.Uri.StartsWith("data:")&&!e.Request.Uri.StartsWith("blob:"))e.Response=core.Environment.CreateWebResourceResponse(new MemoryStream(),403,"Offline","");};
  core.WebMessageReceived+=MessageReceived;
  await core.AddScriptToExecuteOnDocumentCreatedAsync("window.GPC_BOOTSTRAP="+JsonSerializer.Serialize(bootstrap)+";");
  core.NavigationCompleted+=(_,e)=>{ready=e.IsSuccess;if(ready)updater.ConfirmLaunch();if(!ready)MessageBox.Show("画面を読み込めませんでした："+e.WebErrorStatus,"Chromato BRO");};
  core.Navigate(Origin+"/index.html");
 }catch(Exception e){MessageBox.Show("起動できません。Microsoft Edge WebView2 Runtimeの導入状況を確認してください。\n"+e.Message,"Chromato BRO",MessageBoxButtons.OK,MessageBoxIcon.Error);canClose=true;Close();}}
 static bool Allowed(string uri)=>Uri.TryCreate(uri,UriKind.Absolute,out var u)&&u.Scheme=="https"&&u.Host=="gpc-analyzer.invalid"&&u.IsDefaultPort;
 async void MessageReceived(object? sender,CoreWebView2WebMessageReceivedEventArgs e){
  if(!Allowed(e.Source))return;string? id=null;
  try{
   using var doc=JsonDocument.Parse(e.WebMessageAsJson);var root=doc.RootElement;id=root.GetProperty("id").GetString();var kind=root.GetProperty("kind").GetString();var p=root.GetProperty("payload");object? result=true;
   switch(kind){
    case "sessionSave":store.Save(Encoding.UTF8.GetBytes(p.GetRawText()));break;
    case "saveFile":{
     var bytes=Decode(p,100_000_000);var name=Path.GetFileName(p.GetProperty("name").GetString()??"GPC-export");foreach(var c in Path.GetInvalidFileNameChars())name=name.Replace(c,'_');
     using var panel=new SaveFileDialog{FileName=name,AddExtension=true,DefaultExt=Path.GetExtension(name),OverwritePrompt=true};Activate();
     if(panel.ShowDialog(this)==DialogResult.OK){var temp=panel.FileName+"."+Guid.NewGuid().ToString("N")+".tmp";try{File.WriteAllBytes(temp,bytes);File.Move(temp,panel.FileName,true);}finally{if(File.Exists(temp))File.Delete(temp);}}else result=false;break;}
    case "copyImage":{
     var bytes=Decode(p,25_000_000);if(bytes.Length<8||!bytes.Take(8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10}))throw new IOException("PNG画像ではありません。");
     using var stream=new MemoryStream(bytes);using var image=Image.FromStream(stream);if(image.Width>8192||image.Height>8192)throw new IOException("画像が大きすぎます。");using var bitmap=new Bitmap(image);using var png=new MemoryStream(bytes);var data=new DataObject();data.SetData(DataFormats.Bitmap,true,bitmap);data.SetData("PNG",false,png);Clipboard.SetDataObject(data,true,5,100);break;}
    case "openFile":{
     var accept=p.GetProperty("accept").GetString()??"";var exts=accept.Split(',').Select(s=>s.Trim()).Where(s=>System.Text.RegularExpressions.Regex.IsMatch(s,@"^\.[a-zA-Z0-9]+$")).Select(s=>"*"+s).ToArray();
     using var panel=new OpenFileDialog{Multiselect=p.GetProperty("multiple").GetBoolean(),Filter=exts.Length>0?"対応ファイル|"+string.Join(';',exts)+"|全てのファイル|*.*":"全てのファイル|*.*"};Activate();BringToFront();
     var files=new List<object>();long total=0;if(panel.ShowDialog(this)==DialogResult.OK)foreach(var path in panel.FileNames){var size=new FileInfo(path).Length;total+=size;if(total>100_000_000)throw new IOException("一度の読込は100 MB以下にしてください。");files.Add(new{name=Path.GetFileName(path),base64=Convert.ToBase64String(File.ReadAllBytes(path))});}result=files;break;}
    case "closeReady":try{updater.StartPending();canClose=true;Close();}catch(Exception ex){closing=false;updater.CancelPending();MessageBox.Show(ex.Message,"Chromato BRO アップデート");}return;
    case "closeFailed":updater.CancelPending();closing=false;if(MessageBox.Show("自動保存できませんでした。保存せず終了しますか？\nキャンセルしてプロジェクトを別名保存できます。","Chromato BRO",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)==DialogResult.Yes){canClose=true;Close();}return;
    default:throw new IOException("未対応の操作です。");
   }
   Reply(id,result,null);
  }catch(Exception ex){if(id!=null)Reply(id,null,ex.Message);else MessageBox.Show(ex.Message,"Chromato BRO");}
  await Task.CompletedTask;
 }
 static byte[] Decode(JsonElement p,int maximum){var encoded=p.GetProperty("base64").GetString()??"";if(encoded.Length>(long)maximum*4/3+4)throw new IOException("データが大きすぎます。");var b=Convert.FromBase64String(encoded);if(b.Length>maximum)throw new IOException("データが大きすぎます。");return b;}
 void Reply(string? id,object? value,string? error){if(!IsDisposed)web.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new{id,value,error}));}
 async void OnCloseRequested(object? sender,FormClosingEventArgs e){if(canClose||!ready)return;e.Cancel=true;if(closing)return;closing=true;try{await web.ExecuteScriptAsync("window.GPCWindows.flushAndClose()");}catch{updater.CancelPending();closing=false;MessageBox.Show("終了時の保存を開始できませんでした。プロジェクトを保存して再試行してください。","Chromato BRO");}}
}
