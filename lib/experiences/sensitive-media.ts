export function needsPeopleReminder(text: string) {
  return /\b(event|university|school|children|child|minor|students?|gathering|club|party|faces?|people|crowd|private|enfants?|école|université|visages?|personnes)\b|sinh viên|trẻ em|trường học|khuôn mặt|sự kiện|riêng tư|câu lạc bộ/i.test(
    text,
  );
}
