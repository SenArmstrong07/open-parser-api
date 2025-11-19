declare module "*.svg" {
  import * as React from "react";
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;
  const src: string;
  export default src;
}

// allow importing plain CSS / CSS modules and globals-css package
declare module "*.css" {
  const content: { [className: string]: string };
  export default content;
}
declare module "*.module.css" {
  const classes: { [className: string]: string };
  export default classes;
}
declare module "globals-css";

// basic declarations to avoid build failure for express/cors if @types are missing
declare module "express";
declare module "cors";

// test globals (short-term fallback if @types/jest not installed)
declare var describe: any;
declare var it: any;
declare var test: any;
declare var expect: any;

{ 
// Replaced: basic JSX namespace so TypeScript can resolve JSX in components
// Expanded to include Element and other common JSX types used across the codebase.
declare namespace JSX {
  // satisfy `JSX.Element` usages
  type Element = any;

  // satisfy `JSX.ElementClass`/`JSX.ElementChildrenAttribute` etc.
  type ElementClass = any;
  interface ElementChildrenAttribute { children: {} }

  // allow any intrinsic element name with any props (fallback)
  interface IntrinsicElements {
    [elemName: string]: any;
  }

  // allow any attributes on JSX elements (fallback)
  interface IntrinsicAttributes {
    [key: string]: any;
  }
}
}
