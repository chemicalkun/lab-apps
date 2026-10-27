using Microsoft.Win32;
using System.Text.Json;
using System.Runtime.InteropServices;
namespace ChromatoSetup;
internal static class Registration {
 internal const string Product="Chromato BRO";
 internal const string Key=@"Software\Microsoft\Windows\CurrentVersion\Uninstall\ChromatoBRO";
 internal static string Root=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","Chromato BRO");
 internal static string App=>Path.Combine(Root,"App");
 internal static string Exe=>Path.Combine(App,"Chromato BRO.exe");
 internal static string Marker=>Path.Combine(Root,"installation.json");
 internal static string Uninstaller=>Path.Combine(Root,"Installer","Uninstall.exe");
 internal static string Menu=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"Chromato BRO");
 internal static string DesktopLink=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),"Chromato BRO.lnk");
 internal static readonly string[] Links=[Path.Combine(Menu,"Chromato BRO.lnk"),Path.Combine(Menu,"アンインストール.lnk"),DesktopLink];
 internal static void CheckRoot(){
  InstallFiles.RequireOrdinaryDirectory(Root);InstallFiles.RequireOrdinaryDirectory(App);InstallFiles.RequireOrdinaryDirectory(Path.GetDirectoryName(Uninstaller)!);
  if(!Directory.Exists(Root)||!Directory.EnumerateFileSystemEntries(Root).Any())return;
  if(!File.Exists(Marker))throw new IOException("インストール先に別のファイルがあります。既存のフォルダを確認してください。\n"+Root);
  using var json=JsonDocument.Parse(File.ReadAllText(Marker));if(json.RootElement.GetProperty("product").GetString()!=Product)throw new IOException("インストール先を確認できません。");
 }
 internal static void Link(string path,string target,string arguments=""){
  Directory.CreateDirectory(Path.GetDirectoryName(path)!);object? shell=null,shortcut=null;
  try{
   shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell")??throw new IOException("ショートカットを作成できません。"));
   dynamic s=shell!;shortcut=s.CreateShortcut(path);dynamic link=shortcut;link.TargetPath=target;link.Arguments=arguments;link.WorkingDirectory=App;link.IconLocation=Exe+",0";link.Description=Product;link.Save();
  }finally{if(shortcut!=null)Marshal.FinalReleaseComObject(shortcut);if(shell!=null)Marshal.FinalReleaseComObject(shell);}
 }
 internal static void Write(string version,bool desktop){
  Link(Links[0],Exe);Link(Links[1],Uninstaller,"--uninstall");if(desktop)Link(DesktopLink,Exe);
  using var key=Registry.CurrentUser.CreateSubKey(Key);key.SetValue("DisplayName",Product);key.SetValue("DisplayVersion",version);key.SetValue("InstallLocation",Root);key.SetValue("DisplayIcon",'"'+Exe+'"'+",0");key.SetValue("UninstallString",'"'+Uninstaller+'"'+" --uninstall");key.SetValue("URLInfoAbout","https://github.com/chemicalkun/chromato-bro-releases/releases/latest");key.SetValue("NoModify",1,RegistryValueKind.DWord);key.SetValue("NoRepair",1,RegistryValueKind.DWord);
  File.WriteAllText(Marker,JsonSerializer.Serialize(new{product=Product,version}));
 }
 internal sealed class Snapshot {
  readonly Dictionary<string,(object Value,RegistryValueKind Kind)> values=new();readonly Dictionary<string,byte[]?> files=new();readonly bool keyExisted;
  internal Snapshot(){using var key=Registry.CurrentUser.OpenSubKey(Key);keyExisted=key!=null;if(key!=null)foreach(var name in key.GetValueNames())values[name]=(key.GetValue(name)!,key.GetValueKind(name));foreach(var path in Links.Append(Marker))files[path]=File.Exists(path)?File.ReadAllBytes(path):null;}
  internal void Restore(){
   if(keyExisted){Registry.CurrentUser.DeleteSubKeyTree(Key,false);using var key=Registry.CurrentUser.CreateSubKey(Key);foreach(var (name,value) in values)key.SetValue(name,value.Value,value.Kind);}else Registry.CurrentUser.DeleteSubKeyTree(Key,false);
   foreach(var (path,bytes) in files){if(bytes==null){if(File.Exists(path))File.Delete(path);}else{Directory.CreateDirectory(Path.GetDirectoryName(path)!);File.WriteAllBytes(path,bytes);}}
  }
 }
 internal static bool OwnedLink(string path){
  object? shell=null,shortcut=null;
  try{shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell")!);dynamic s=shell!;shortcut=s.CreateShortcut(path);dynamic link=shortcut;string target=link.TargetPath;return string.Equals(target,Exe,StringComparison.OrdinalIgnoreCase)||string.Equals(target,Uninstaller,StringComparison.OrdinalIgnoreCase);}
  catch{return false;}
  finally{if(shortcut!=null)Marshal.FinalReleaseComObject(shortcut);if(shell!=null)Marshal.FinalReleaseComObject(shell);}
 }
 internal static void Remove(){
  CheckRoot();foreach(var path in Links)if(File.Exists(path)&&OwnedLink(path)){
   // Remove only shortcuts that point to this installation.
   File.Delete(path);
  }
  Registry.CurrentUser.DeleteSubKeyTree(Key,false);
 }
}
