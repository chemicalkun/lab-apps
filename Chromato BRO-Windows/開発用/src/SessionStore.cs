using System.Security.Cryptography;
using System.Text.Json;
namespace GPCAnalyzer;
public sealed class SessionStore
{
    private readonly string path;
    private string? expected;
    private bool blocked;
    public SessionStore(string folder) { Directory.CreateDirectory(folder);path=Path.Combine(folder,"session-v1.json"); }
    private static string Digest(byte[] bytes)=>Convert.ToHexString(SHA256.HashData(bytes));
    private static void Validate(byte[] bytes) {
        if(bytes.Length>100_000_000)throw new IOException("自動保存は100 MB以下にしてください。");
        using var doc=JsonDocument.Parse(bytes);
        if(doc.RootElement.GetProperty("format").GetString()!="GPC-session-v1")throw new IOException("未対応の保存形式です。");
        _=doc.RootElement.GetProperty("project");_=doc.RootElement.GetProperty("workspace");
    }
    public JsonElement? Load() {
        try { if(!File.Exists(path))return null;var data=File.ReadAllBytes(path);Validate(data);expected=Digest(data);using var doc=JsonDocument.Parse(data);return doc.RootElement.Clone(); }
        catch {blocked=true;throw;}
    }
    public void Save(byte[] bytes) {
        if(blocked)throw new IOException("既存の保存データを読み込めなかったため上書きしません。プロジェクトを別名保存してください。");
        Validate(bytes);
        using var guard=new FileStream(path+".lock",FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);
        var current=File.Exists(path)?Digest(File.ReadAllBytes(path)):null;
        if(current!=expected)throw new IOException("保存ファイルが外部で変更されました。プロジェクトを別名保存してください。");
        var temp=path+"."+Guid.NewGuid().ToString("N")+".tmp";
        try {
            using(var file=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {file.Write(bytes);file.Flush(true);}
            if(File.Exists(path))File.Replace(temp,path,Path.Combine(Path.GetDirectoryName(path)!,"session-v1.previous.json"));else File.Move(temp,path);
            expected=Digest(bytes);
        } finally {if(File.Exists(temp))File.Delete(temp);}
    }
}
