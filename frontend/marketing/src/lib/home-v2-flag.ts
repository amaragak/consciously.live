/** Roll back homepage v2 with `NEXT_PUBLIC_HOME_V2=false`. Default: on. */
export function isHomeV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_HOME_V2 !== "false";
}
