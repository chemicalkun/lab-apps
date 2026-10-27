using Microsoft.Win32;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;
using System.Text.RegularExpressions;
namespace ChromatoSetup;
internal static class RuntimeSupport {
 internal static bool Present(){
  const string path=@"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
  foreach(var hive in new[]{RegistryHive.CurrentUser,RegistryHive.LocalMachine})foreach(var view in new[]{RegistryView.Registry32,RegistryView.Registry64}){
   using var root=RegistryKey.OpenBaseKey(hive,view);using var key=root.OpenSubKey(path);if(Version.TryParse(key?.GetValue("pv")?.ToString(),out var version)&&version>new Version(0,0,0,0))return true;
  }
  return false;
 }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct FileInfo {public uint Size;[MarshalAs(UnmanagedType.LPWStr)]public string Path;public IntPtr File,Subject;}
 [StructLayout(LayoutKind.Sequential)]struct TrustData {public uint Size;public IntPtr Policy,Sip;public uint Ui,Revocation,Choice;public IntPtr Info;public uint Action;public IntPtr State,Reference;public uint Flags,Context;public IntPtr SignatureSettings;}
 [DllImport("wintrust.dll",ExactSpelling=true,PreserveSig=true)]static extern int WinVerifyTrust(IntPtr hwnd,ref Guid action,ref TrustData data);
 internal static void VerifyMicrosoft(string path){
  var info=new FileInfo{Size=(uint)Marshal.SizeOf<FileInfo>(),Path=path};var pointer=Marshal.AllocHGlobal(Marshal.SizeOf<FileInfo>());Marshal.StructureToPtr(info,pointer,false);
  var action=new Guid("00AAC56B-CD44-11D0-8CC2-00C04FC295EE");var data=new TrustData{Size=(uint)Marshal.SizeOf<TrustData>(),Ui=2,Choice=1,Info=pointer,Action=1,Flags=0x80};
  try{
   if(WinVerifyTrust(new IntPtr(-1),ref action,ref data)!=0)throw new IOException("Microsoftランタイムの署名を確認できませんでした。");
#pragma warning disable SYSLIB0057
   using var certificate=new X509Certificate2(X509Certificate.CreateFromSignedFile(path));
#pragma warning restore SYSLIB0057
   if(!Regex.IsMatch(certificate.Subject,@"(?:^|,\s*)O=Microsoft Corporation(?:,|$)"))throw new IOException("Microsoft公式のインストーラではありません。");
  }finally{data.Action=2;WinVerifyTrust(new IntPtr(-1),ref action,ref data);Marshal.DestroyStructure<FileInfo>(pointer);Marshal.FreeHGlobal(pointer);}
 }
}
