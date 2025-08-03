export function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertNot(condition: any, message: string) {
  if (condition) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertEqual(a: any, b: any, message: string) {
  if (a !== b) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertNotEqual(a: any, b: any, message: string) {
  if (a === b) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertGt(a: any, b: any, message: string) {
  if (a <= b) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertLt(a: any, b: any, message: string) {
  if (a >= b) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertGte(a: any, b: any, message: string) {
  if (a < b) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertLte(a: any, b: any, message: string) {
  if (a > b) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertGtEqual(a: any, b: any, message: string) {
  if (a < b) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertLtEqual(a: any, b: any, message: string) {
  if (a > b) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertGtZero(a: any, message: string) {
  if (a <= 0) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertLtZero(a: any, message: string) {
  if (a >= 0) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertGtZeroEqual(a: any, message: string) {
  if (a < 0) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertLtZeroEqual(a: any, message: string) {
  if (a > 0) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertNotZero(a: any, message: string) {
  if (a === 0) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertNotZeroEqual(a: any, message: string) {
  if (a === 0) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertNotEqualZero(a: any, message: string) {
  if (a === 0) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertNotEqualZeroEqual(a: any, message: string) {
  if (a === 0) {
    console.error(`❌❌❌ ASSERTION FAILED: ${message} ❌❌❌`);
    throw new Error(`Assertion failed: ${message}`);
  }
}
