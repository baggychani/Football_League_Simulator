export function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= n; index++) augmented[column][index] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (factor === 0) continue;
      for (let index = column; index <= n; index++) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map(row => row[n]);
}

export function regularizedLeastSquaresStep(
  jacobian: number[][],
  residual: number[],
  damping: number,
): { step: number[]; conditionEstimate: number } | null {
  const rows = jacobian.length;
  const columns = jacobian[0]?.length ?? 0;
  const normal = Array.from({ length: columns }, () => Array(columns).fill(0));
  const rhs = Array(columns).fill(0);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      rhs[column] -= jacobian[row][column] * residual[row];
      for (let other = 0; other < columns; other++) {
        normal[column][other] += jacobian[row][column] * jacobian[row][other];
      }
    }
  }
  for (let column = 0; column < columns; column++) normal[column][column] += damping;
  const diagonal = normal.map((row, index) => Math.abs(row[index])).filter(value => value > 1e-12);
  const conditionEstimate = diagonal.length
    ? Math.max(...diagonal) / Math.max(Math.min(...diagonal), 1e-12)
    : Number.POSITIVE_INFINITY;
  const step = solveLinearSystem(normal, rhs);
  return step ? { step, conditionEstimate } : null;
}

export function clampStep(step: number[], maxAbsolute: number): number[] {
  const largest = Math.max(...step.map(Math.abs), 0);
  if (largest <= maxAbsolute) return step;
  const scale = maxAbsolute / largest;
  return step.map(value => value * scale);
}

export function broydenUpdate(
  jacobian: number[][],
  step: number[],
  residualChange: number[],
): number[][] {
  const denominator = step.reduce((sum, value) => sum + value * value, 0);
  if (denominator < 1e-12) return jacobian;
  const predicted = jacobian.map(row => row.reduce((sum, value, index) => sum + value * step[index], 0));
  return jacobian.map((row, rowIndex) =>
    row.map(
      (value, column) =>
        value + ((residualChange[rowIndex] - predicted[rowIndex]) * step[column]) / denominator,
    ),
  );
}
