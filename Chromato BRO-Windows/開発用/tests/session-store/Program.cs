using GPCAnalyzer;
using System.Text;
var dir=Path.Combine(Path.GetTempPath(),"gpc-session-test-"+Guid.NewGuid());Directory.CreateDirectory(dir);
byte[] Data(int n)=>System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new{format="GPC-session-v1",project=new{n},workspace=new{}});
void Check(bool condition){if(!condition)throw new Exception("Test failed");}
void Reject(Action action){bool failed=false;try{action();}catch{failed=true;}Check(failed);}
try{
 var a=new SessionStore(dir);Check(a.Load()==null);a.Save(Data(1));a.Save(Data(2));Check(File.ReadAllBytes(Path.Combine(dir,"session-v1.previous.json")).SequenceEqual(Data(1)));
 var b=new SessionStore(dir);Check(b.Load()!.Value.GetProperty("project").GetProperty("n").GetInt32()==2);
 a.Save(Data(3));Reject(()=>b.Save(Data(4)));Check(File.ReadAllBytes(Path.Combine(dir,"session-v1.json")).SequenceEqual(Data(3)));
 File.WriteAllText(Path.Combine(dir,"session-v1.json"),"broken");var c=new SessionStore(dir);Reject(()=>c.Load());Reject(()=>c.Save(Data(5)));Check(File.ReadAllText(Path.Combine(dir,"session-v1.json"))=="broken");
 Console.WriteLine("PASS: Windows SessionStore save/reopen, atomic backup, stale writer rejection and corrupt-data preservation (tested on macOS)");
}finally{Directory.Delete(dir,true);}
