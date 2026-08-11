from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


WIDTH, HEIGHT = 960, 540
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/brand/exports/marketplace/previews"
OUTPUT.mkdir(parents=True, exist_ok=True)

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

NAVY = (34, 65, 109)
NAVY_DEEP = (18, 39, 72)
CREAM = (255, 248, 239)
CORAL = (255, 91, 104)
MAGENTA = (219, 79, 155)
SOFT_BLUE = (115, 149, 196)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)


def background() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), NAVY_DEEP)
    pixels = image.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            vertical = y / HEIGHT
            horizontal = x / WIDTH
            glow = max(0.0, 1.0 - (((horizontal - 0.78) / 0.7) ** 2 + ((vertical - 0.22) / 0.8) ** 2))
            pixels[x, y] = tuple(
                round(NAVY_DEEP[channel] * (1 - vertical * 0.35) + NAVY[channel] * vertical * 0.35 + SOFT_BLUE[channel] * glow * 0.10)
                for channel in range(3)
            )
    return image


def wordmark(canvas: Image.Image, x: int = 74, y: int = 52) -> None:
    draw = ImageDraw.Draw(canvas)
    agent_font = font(74, bold=True)
    stack_font = font(74, bold=True)
    agent = "Agent"
    agent_width = draw.textlength(agent, font=agent_font)
    draw.text((x, y), agent, font=agent_font, fill=CREAM)

    stack_x = round(x + agent_width - 2)
    mask = Image.new("L", canvas.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.text((stack_x, y), "Stack", font=stack_font, fill=255)
    gradient = Image.new("RGB", canvas.size, CORAL)
    gp = gradient.load()
    for gx in range(stack_x, min(WIDTH, stack_x + 275)):
        amount = (gx - stack_x) / 275
        color = tuple(round(CORAL[c] * (1 - amount) + MAGENTA[c] * amount) for c in range(3))
        for gy in range(y, min(HEIGHT, y + 95)):
            gp[gx, gy] = color
    canvas.paste(gradient, (0, 0), mask)

    subtitle = "R E A L   E S T A T E   S O L U T I O N S"
    draw.text((x + 4, y + 91), subtitle, font=font(19), fill=(235, 240, 248))


def accent(canvas: Image.Image) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle((720, -80, 1040, 240), 96, fill=(*MAGENTA, 42))
    draw.rounded_rectangle((-120, 400, 290, 650), 120, fill=(*CORAL, 28))
    canvas.paste(layer, (0, 0), layer.filter(ImageFilter.GaussianBlur(24)))


def pill(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], label: str, fill: tuple[int, int, int], text_fill: tuple[int, int, int] = CREAM) -> None:
    draw.rounded_rectangle(xy, 22, fill=fill)
    f = font(21, bold=True)
    box = draw.textbbox((0, 0), label, font=f)
    tw, th = box[2] - box[0], box[3] - box[1]
    draw.text(((xy[0] + xy[2] - tw) / 2, (xy[1] + xy[3] - th) / 2 - 2), label, font=f, fill=text_fill)


def create_one() -> Image.Image:
    image = background()
    accent(image)
    wordmark(image)
    draw = ImageDraw.Draw(image)
    draw.text((74, 246), "One guided business portal", font=font(47, bold=True), fill=CREAM)
    draw.text((76, 307), "Connect your tools. Organize your work. Keep control.", font=font(24), fill=(211, 223, 240))
    pill(draw, (76, 385, 270, 449), "1  Connect", NAVY)
    pill(draw, (293, 385, 487, 449), "2  Organize", SOFT_BLUE, NAVY_DEEP)
    pill(draw, (510, 385, 724, 449), "3  Operate", CORAL)
    draw.text((76, 485), "User-approved access • Private workspace • No password stored", font=font(18), fill=(190, 207, 231))
    return image


def create_two() -> Image.Image:
    image = background()
    accent(image)
    wordmark(image)
    draw = ImageDraw.Draw(image)
    draw.text((74, 232), "Start with what you already have.", font=font(42, bold=True), fill=CREAM)
    items = [
        ("Contacts", "Bring over people and verified lead details."),
        ("Workflows", "Connect useful business context in one place."),
        ("Business profile", "Build an accurate AgentStack Blueprint."),
    ]
    for index, (title, detail) in enumerate(items):
        top = 305 + index * 67
        draw.rounded_rectangle((76, top, 884, top + 51), 18, fill=(43, 78, 126))
        draw.ellipse((93, top + 15, 113, top + 35), fill=CORAL if index != 1 else MAGENTA)
        draw.text((132, top + 8), title, font=font(22, bold=True), fill=CREAM)
        draw.text((330, top + 11), detail, font=font(18), fill=(211, 223, 240))
    return image


def create_three() -> Image.Image:
    image = background()
    accent(image)
    wordmark(image)
    draw = ImageDraw.Draw(image)
    draw.text((74, 224), "You control every connection.", font=font(48, bold=True), fill=CREAM)
    draw.text((76, 287), "Nothing changes without your approval.", font=font(26), fill=(211, 223, 240))
    cards = [
        ("PERMISSIONED", "Connect without sharing your password."),
        ("PRIVATE", "Review information inside your workspace."),
        ("CONNECTED", "Use approved details across AgentStack."),
    ]
    for index, (title, detail) in enumerate(cards):
        left = 76 + index * 285
        draw.rounded_rectangle((left, 363, left + 255, 486), 24, fill=(45, 81, 130), outline=(91, 126, 174), width=2)
        draw.text((left + 20, 382), title, font=font(18, bold=True), fill=CORAL if index != 1 else MAGENTA)
        words = detail.split()
        lines = [" ".join(words[:4]), " ".join(words[4:])]
        draw.text((left + 20, 420), "\n".join(lines), font=font(17), fill=CREAM, spacing=5)
    return image


for number, creator in enumerate((create_one, create_two, create_three), start=1):
    creator().save(OUTPUT / f"agentstack-marketplace-preview-{number}.png", optimize=True, compress_level=9)
