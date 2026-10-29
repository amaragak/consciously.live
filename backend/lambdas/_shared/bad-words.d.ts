declare module "bad-words" {
  export default class Filter {
    constructor(options?: { list?: string[]; exclude?: string[]; placeHolder?: string; regex?: RegExp; replaceRegex?: RegExp; splitRegex?: RegExp });
    isProfane(text: string): boolean;
    clean(text: string): string;
    addWords(...words: string[]): void;
    removeWords(...words: string[]): void;
  }
}
