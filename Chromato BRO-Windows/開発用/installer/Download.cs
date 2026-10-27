using System.Net;
using GPCAnalyzer;
namespace ChromatoSetup;
internal static class Download {
 internal static async Task FileAsync(string url,string output,long limit,CancellationToken token,IProgress<string> progress){
  var uri=UpdateProtocol.HttpsUrl(url);
  using var handler=new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false,AutomaticDecompression=DecompressionMethods.None};using var client=new HttpClient(handler){Timeout=TimeSpan.FromMinutes(10)};
  for(int redirects=0;redirects<10;redirects++){
   using var response=await client.GetAsync(uri,HttpCompletionOption.ResponseHeadersRead,token);
   if((int)response.StatusCode is 301 or 302 or 303 or 307 or 308){uri=UpdateProtocol.HttpsUrl(new Uri(uri,response.Headers.Location??throw new IOException("配布先の応答が不正です。")).AbsoluteUri);continue;}
   if(response.StatusCode!=HttpStatusCode.OK||response.Content.Headers.ContentLength>limit)throw new IOException("ダウンロードできません。インターネット接続を確認してください。");
   await using var input=await response.Content.ReadAsStreamAsync(token);await using var file=new FileStream(output,FileMode.CreateNew,FileAccess.Write,FileShare.None,81920,true);
   byte[] buffer=new byte[81920];long total=0;int read;long last=0;
   while((read=await input.ReadAsync(buffer,token))>0){total+=read;if(total>limit)throw new IOException("ダウンロードサイズが上限を超えました。");await file.WriteAsync(buffer.AsMemory(0,read),token);if(total-last>=1048576){last=total;progress.Report($"ダウンロード中… {total/1048576d:F1} MB");}}
   return;
  }
  throw new IOException("配布先の転送回数が多すぎます。");
 }
}
