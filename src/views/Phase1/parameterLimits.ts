// 接口约束与产品侧输入边界共用，避免页面和保存校验不一致。
export const parameterLimits={
 threshold:{min:10,max:4320,step:10},
 repeat:{min:1,max:1440,step:1},
 fence:{min:100,max:50000,step:100},
 deviation:{min:100,max:10000,step:100},
 poi:{min:50,max:5000,step:50},
 grace:{min:0,max:1440,step:1},
 filterMax:2000,
};
export function inParameterRange(value:number,rule:{min:number;max:number;step:number}){return Number.isSafeInteger(value)&&value>=rule.min&&value<=rule.max&&(value-rule.min)%rule.step===0;}
