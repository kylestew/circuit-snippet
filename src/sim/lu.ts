export function luSolve(A: Float64Array[], z: Float64Array): Float64Array {
  const n = z.length;
  const x = new Float64Array(n);

  // Copy A and z so we don't mutate originals
  const a = A.map(row => new Float64Array(row));
  const b = new Float64Array(z);

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxVal = Math.abs(a[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(a[row][col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = row;
      }
    }

    if (maxVal < 1e-18) {
      throw new Error(`Singular matrix at column ${col}`);
    }

    // Swap rows
    if (maxRow !== col) {
      const tmpRow = a[col];
      a[col] = a[maxRow];
      a[maxRow] = tmpRow;
      const tmpB = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tmpB;
    }

    // Eliminate below
    const pivot = a[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / pivot;
      for (let j = col + 1; j < n; j++) {
        a[row][j] -= factor * a[col][j];
      }
      a[row][col] = 0;
      b[row] -= factor * b[col];
    }
  }

  // Back substitution
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let j = row + 1; j < n; j++) {
      sum -= a[row][j] * x[j];
    }
    x[row] = sum / a[row][row];
  }

  return x;
}
