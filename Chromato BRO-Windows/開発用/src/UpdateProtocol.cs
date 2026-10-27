using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.IO.Compression;
namespace GPCAnalyzer;
internal sealed record UpdateRelease(string Version,int Build,string Url,string Sha256,long Size,string Notes);
internal sealed record UpdatePayload(int Schema,string App,Dictionary<string,UpdateRelease> Releases);
internal sealed record UpdateEnvelope(string Payload,string Signature);
internal static class UpdateProtocol {
 internal const string FeedUrl="https://github.com/chemicalkun/chromato-bro-releases/releases/latest/download/updates.json";
 static readonly JsonSerializerOptions JsonOptions=new(){PropertyNameCaseInsensitive=true};
 internal static Uri HttpsUrl(string text){
  if(!Uri.TryCreate(text,UriKind.Absolute,out var uri)||uri.Scheme!="https"||string.IsNullOrEmpty(uri.Host)||!string.IsNullOrEmpty(uri.UserInfo)||!string.IsNullOrEmpty(uri.Fragment))throw new IOException("https:// で始まる配布URLを入力してください。");return uri;
 }
 internal static Version VersionNumber(string text){
  if(!Regex.IsMatch(text,@"^\d{1,2}\.\d{1,2}\.\d{1,2}$",RegexOptions.CultureInvariant)||!Version.TryParse(text,out var v)||v.Major>99||v.Minor<1||v.Minor>12||v.Build<1||v.Build>31)throw new IOException("更新バージョンの形式が不正です。");return v;
 }
 internal static bool Newer(UpdateRelease release,string current,int build){var compare=VersionNumber(release.Version).CompareTo(VersionNumber(current));return compare>0||(compare==0&&release.Build>build);}
 internal static UpdateRelease Decode(byte[] data,byte[] key,string platform){
  if(data.Length>262144)throw new IOException("更新情報が大きすぎます。");
  var envelope=JsonSerializer.Deserialize<UpdateEnvelope>(data,JsonOptions)??throw new IOException("更新情報が不正です。");
  var payload=Convert.FromBase64String(envelope.Payload);using var rsa=RSA.Create();rsa.ImportRSAPublicKey(key,out _);
  if(!rsa.VerifyData(payload,Convert.FromBase64String(envelope.Signature),HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1))throw new IOException("更新情報の署名を確認できません。配布元を確認してください。");
  var manifest=JsonSerializer.Deserialize<UpdatePayload>(payload,JsonOptions)??throw new IOException("更新情報が不正です。");
  if(manifest.Schema!=1||manifest.App!="Chromato BRO"||manifest.Releases==null||!manifest.Releases.TryGetValue(platform,out var r)||r.Build<1||r.Build>65535||r.Size<1||r.Size>600_000_000||r.Sha256==null||!Regex.IsMatch(r.Sha256,@"^[a-f0-9]{64}$")||r.Notes==null||r.Notes.Length>4000)throw new IOException("このアプリ用の更新情報ではありません。");
  _=VersionNumber(r.Version);_=HttpsUrl(r.Url);return r;
 }
 internal static void VerifyFile(string file,UpdateRelease r){using var stream=File.OpenRead(file);if(stream.Length!=r.Size||!Convert.ToHexString(SHA256.HashData(stream)).Equals(r.Sha256,StringComparison.OrdinalIgnoreCase))throw new IOException("ダウンロードしたファイルが更新情報と一致しません。");}
 internal static void Extract(string archive,string destination){
  using var zip=ZipFile.OpenRead(archive);if(zip.Entries.Count==0||zip.Entries.Count>10000)throw new IOException("更新ZIPの構成が不正です。");
  long total=0;var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  foreach(var entry in zip.Entries){
   var n=entry.FullName;var parts=n.Split('/',StringSplitOptions.RemoveEmptyEntries);
   if(parts.Length==0||parts[0]!="Chromato BRO Windows"||n.StartsWith('/')||n.Contains('\\')||n.Contains(':')||n.Contains('\0')||parts.Any(p=>p==".."||p=="."||p.EndsWith(' ')||p.EndsWith('.'))||!names.Add(n)||((entry.ExternalAttributes>>16)&0xf000)==0xa000)throw new IOException("更新ZIPに不正なファイル名が含まれています。");
   total=checked(total+entry.Length);if(total>1_500_000_000)throw new IOException("展開後の更新ファイルが大きすぎます。");
  }
  foreach(var entry in zip.Entries){var path=Path.GetFullPath(Path.Combine(destination,entry.FullName));if(!path.StartsWith(Path.GetFullPath(destination)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new IOException("更新ZIPのパスが不正です。");if(entry.FullName.EndsWith('/'))Directory.CreateDirectory(path);else{Directory.CreateDirectory(Path.GetDirectoryName(path)!);entry.ExtractToFile(path,false);}}
 }
}
