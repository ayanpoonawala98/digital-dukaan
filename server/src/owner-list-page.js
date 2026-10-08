import {Op} from 'sequelize';
export function listOptions(query, fields, where){
 const next={...where};const q=String(query.q||'').trim().slice(0,200);
 if(q)next[Op.or]=fields.map(field=>({[field]:{[Op.iLike]:`%${q.replace(/[\\%_]/g,'\\$&')}%`}}));
 if(query.status==='active'||query.status==='inactive')next.active=query.status==='active';
 else if(query.status && query.status!=='all' && ['pending','confirmed'].includes(query.status))next.status=String(query.status);
 if(query.limit===undefined)return{where:next};
 if(![10,15].includes(Number(query.limit)))throw Object.assign(Error('Use an initial 15 or subsequent 10'),{status:400});
 const cursor=query.cursor===undefined?null:Number(query.cursor);
 if(cursor!==null&&(!Number.isInteger(cursor)||cursor<1))throw Object.assign(Error('Invalid list cursor'),{status:400});
 return {where:next,cursor,limit:Number(query.limit)+1};
}
export async function ownerList(Model,key,req,where,fields,extra={},map=row=>row){
 const opts=listOptions(req.query,fields,where);
 if(!opts.limit)return{[key]:(await Model.findAll({...extra,where:opts.where,order:[['id','DESC']]})).map(map)};
 const pageWhere=opts.cursor?{[Op.and]:[opts.where,{id:{[Op.lt]:opts.cursor}}]}:opts.where;
 const [rows,total]=await Promise.all([Model.findAll({...extra,where:pageWhere,order:[['id','DESC']],limit:opts.limit}),Model.count({where:opts.where,include:extra.include})]);
 const size=opts.limit-1;const kept=rows.slice(0,size);return{[key]:kept.map(map),total,hasMore:rows.length>size,nextCursor:rows.length>size?String(kept.at(-1).id):null};
}
