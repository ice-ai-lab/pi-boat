/** CSS Modules 类型（ui 包无 vite 依赖，自持最小声明；等价 vite/client 的 *.module.css） */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
