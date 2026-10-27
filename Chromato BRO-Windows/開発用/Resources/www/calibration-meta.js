/* Calibration provenance only; never changes regression or molecular calculations. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;root.GPCCalibrationMeta=api;})(typeof window==='object'?window:globalThis,()=>{
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 function filenameDate(name){const m=name.match(/(?:^|\D)(20\d{2})[._-]?(\d{2})[._-]?(\d{2})(?!\d)/);const s=m?`${m[1]}-${m[2]}-${m[3]}`:'';return validDate(s)?s:'';}
 function validate(meta){if(meta.measuredDate&&!validDate(meta.measuredDate))throw Error('標準試料の測定日が不正です。');if(meta.measuredTime&&!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(meta.measuredTime))throw Error('標準試料の測定時刻が不正です。');if(meta.measuredTime&&!meta.measuredDate)throw Error('測定時刻と一緒に測定日を入力してください。');}
 function label(cal){let date='測定日時 未設定';if(cal.measuredDate&&validDate(cal.measuredDate)){date=cal.measuredDate.replaceAll('-','/')+(cal.measuredTime?' '+cal.measuredTime:'');}return `${date} · PSstandard${['RI','UV'].includes(cal.detector)?' / '+cal.detector:''}`;}
 return {filenameDate,validate,label};
});
