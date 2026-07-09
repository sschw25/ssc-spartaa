// 브라우저 클라이언트 전용 이미지 압축 — 업로드 전 캔버스로 리사이즈·JPEG 재인코딩.
// 폰 원본(3~5MB)을 가로/세로 최대 maxDim, 품질 quality 로 줄여 보통 150~400KB로 만든다.
// 서버/워크플로에서 호출 금지(document/Image 필요).

export async function compressImageToJpeg(file: File, maxDim = 1280, quality = 0.8): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    el.src = dataUrl;
  });

  let { width, height } = img;
  const longest = Math.max(width, height);
  if (longest > maxDim) {
    const scale = maxDim / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 사용할 수 없습니다.');
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 압축에 실패했습니다.'))),
      'image/jpeg',
      quality,
    );
  });
}
