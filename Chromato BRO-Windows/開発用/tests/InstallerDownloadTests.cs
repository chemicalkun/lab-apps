using ChromatoSetup;
using GPCAnalyzer;
using System.Diagnostics;
var work=Directory.CreateTempSubdirectory("chromato-download-test-").FullName;
try{
 var feed=Path.Combine(work,"feed");await Download.FileAsync(UpdateProtocol.FeedUrl,feed,262144,CancellationToken.None,new Progress<string>());
 var bytes=await File.ReadAllBytesAsync(feed);var key=File.ReadAllBytes("public.der");var release=UpdateProtocol.Decode(bytes,key,"windows-x64");
 var zip=Path.Combine(work,"app.zip");await Download.FileAsync(release.Url,zip,release.Size,CancellationToken.None,new Progress<string>());UpdateProtocol.VerifyFile(zip,release);UpdateProtocol.Extract(zip,work);
 var info=FileVersionInfo.GetVersionInfo(Path.Combine(work,"Chromato BRO Windows","Chromato BRO.dll"));if(info.ProductName!="Chromato BRO"||info.ProductVersion?.Split('+')[0]!=release.Version||info.FilePrivatePart!=release.Build)throw new Exception("Wrong binary metadata");
 var envelope=System.Text.Json.Nodes.JsonNode.Parse(bytes)!;var payload=Convert.FromBase64String((string)envelope["payload"]!);payload[0]^=1;envelope["payload"]=Convert.ToBase64String(payload);
 bool rejected=false;try{UpdateProtocol.Decode(System.Text.Encoding.UTF8.GetBytes(envelope.ToJsonString()),key,"windows-x64");}catch(IOException){rejected=true;}if(!rejected)throw new Exception("Corruption accepted");
 Console.WriteLine($"PASS: installer HTTPS download, signed feed, SHA256, safe ZIP extraction, binary version {release.Version} build {release.Build}, tamper rejection");
}finally{Directory.Delete(work,true);}
