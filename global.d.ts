
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
// Added: basic JSX namespace so TypeScript can resolve JSX in components
// This is a safe fallback when @types/react might not be available during the build.
declare namespace JSX {
  interface IntrinsicElements {
    // allow any element name with any props as a last-resort fallback
    [elemName: string]: any;
  }
  interface IntrinsicAttributes {
    [key: string]: any;
  }
}
}
