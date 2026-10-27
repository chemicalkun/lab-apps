using GPCAnalyzer;
using System.IO.Compression;
static void Reject(Action body){try{body();}catch{return;}throw new Exception("Accepted invalid update");}
static void Check(bool value){if(!value)throw new Exception("Assertion failed");}
Check(UpdateProtocol.FeedUrl=="https://github.com/chemicalkun/chromato-bro-releases/releases/latest/download/updates.json");
var root=args[0];var key=File.ReadAllBytes(Path.Combine(root,"public.der"));var manifest=File.ReadAllBytes(Path.Combine(root,"updates.json"));
var release=UpdateProtocol.Decode(manifest,key,"windows-x64");Check(release.Version=="26.10.21"&&release.Build==42);
Check(UpdateProtocol.Newer(release,"26.10.20",41));Check(UpdateProtocol.Newer(release,"26.10.21",41));Check(!UpdateProtocol.Newer(release,"26.10.21",42));Check(!UpdateProtocol.Newer(release,"26.10.22",1));
UpdateProtocol.VerifyFile(Path.Combine(root,"package.zip"),release);
foreach(var name in new[]{"tampered.json","bad-hash.json","bad-size.json","bad-url.json","bad-app.json","bad-schema.json","bad-version.json","bad-build.json"}){
 var data=File.ReadAllBytes(Path.Combine(root,name));if(name=="bad-hash.json"){var r=UpdateProtocol.Decode(data,key,"windows-x64");Reject(()=>UpdateProtocol.VerifyFile(Path.Combine(root,"package.zip"),r));}else Reject(()=>UpdateProtocol.Decode(data,key,"windows-x64"));
}
Reject(()=>UpdateProtocol.Decode(manifest,"wrong key"u8.ToArray(),"windows-x64"));Reject(()=>UpdateProtocol.Decode(manifest,key,"unsupported"));
foreach(var url in new[]{"http://example.com","https://user:pass@example.com/update","https://example.com/#fragment","file:///tmp/app","nonsense"})Reject(()=>UpdateProtocol.HttpsUrl(url));
foreach(var name in new[]{"valid.zip","traversal.zip","duplicate.zip","symlink.zip","absolute.zip","backslash.zip"}){
 var dest=Path.Combine(root,Guid.NewGuid().ToString("N"));Directory.CreateDirectory(dest);if(name=="valid.zip"){UpdateProtocol.Extract(Path.Combine(root,name),dest);Check(File.ReadAllText(Path.Combine(dest,"Chromato BRO Windows","www","index.html"))=="test");}else Reject(()=>UpdateProtocol.Extract(Path.Combine(root,name),dest));
}
Console.WriteLine("PASS: .NET signed manifest, tamper/wrong key, SHA256/size, HTTPS, version/build, platform/schema, ZIP traversal/duplicates/symlinks");
