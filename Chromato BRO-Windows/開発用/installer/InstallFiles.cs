namespace ChromatoSetup;
internal static class InstallFiles {
 internal static void RequireOrdinaryDirectory(string path){
  for(var d=new DirectoryInfo(Path.GetFullPath(path));d!=null;d=d.Parent)if(d.Exists&&(d.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("リンク先へのインストールはできません。");
 }
 internal static void Replace(string candidate,string target,Action register){
  RequireOrdinaryDirectory(candidate);RequireOrdinaryDirectory(target);
  var backup=target+".setup-backup-"+Guid.NewGuid().ToString("N");bool previous=Directory.Exists(target),swapped=false;
  try{
   if(previous)Directory.Move(target,backup);
   Directory.Move(candidate,target);swapped=true;register();
  }catch{
   if(swapped)Directory.Move(target,candidate);
   if(previous&&Directory.Exists(backup))Directory.Move(backup,target);
   throw;
  }
  if(previous)TryDelete(backup);
 }
 internal static void TryDelete(string path){try{if(Directory.Exists(path))Directory.Delete(path,true);}catch{}}
}
