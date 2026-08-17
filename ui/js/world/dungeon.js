export class DungeonGenerator {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.map = Array.from({ length: height }, () => Array(width).fill(1)); // 1 for wall, 0 for floor
        this.rooms = [];
    }

    generate() {
        const root = { x: 1, y: 1, w: this.width - 2, h: this.height - 2 };
        this.split(root, 4);
        this.createRooms();
        this.createCorridors();
        return this.map;
    }

    split(node, iter) {
        if (iter === 0) {
            this.rooms.push(node);
            return;
        }

        let splitHorizontally = Math.random() > 0.5;
        if (node.w > node.h * 1.25) splitHorizontally = false;
        else if (node.h > node.w * 1.25) splitHorizontally = true;

        const minSize = 6;
        if (splitHorizontally) {
            if (node.h <= minSize * 2) {
                this.rooms.push(node);
                return;
            }
            const splitY = Math.floor(Math.random() * (node.h - minSize * 2)) + minSize;
            node.left = { x: node.x, y: node.y, w: node.w, h: splitY };
            node.right = { x: node.x, y: node.y + splitY, w: node.w, h: node.h - splitY };
        } else {
            if (node.w <= minSize * 2) {
                this.rooms.push(node);
                return;
            }
            const splitX = Math.floor(Math.random() * (node.w - minSize * 2)) + minSize;
            node.left = { x: node.x, y: node.y, w: splitX, h: node.h };
            node.right = { x: node.x + splitX, y: node.y, w: node.w - splitX, h: node.h };
        }
        
        this.split(node.left, iter - 1);
        this.split(node.right, iter - 1);
    }

    createRooms() {
        for (const room of this.rooms) {
            room.room = {
                x: room.x + 1 + Math.floor(Math.random() * (room.w / 3)),
                y: room.y + 1 + Math.floor(Math.random() * (room.h / 3)),
                w: room.w - 2 - Math.floor(Math.random() * (room.w / 3)),
                h: room.h - 2 - Math.floor(Math.random() * (room.h / 3)),
            };
            for (let y = room.room.y; y < room.room.y + room.room.h; y++) {
                for (let x = room.room.x; x < room.room.x + room.room.w; x++) {
                    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                        this.map[y][x] = 0;
                    }
                }
            }
            room.center = {
                x: Math.floor(room.room.x + room.room.w / 2),
                y: Math.floor(room.room.y + room.room.h / 2),
            };
        }
    }

    createCorridors() {
        for (let i = 0; i < this.rooms.length - 1; i++) {
            const r1 = this.rooms[i].center;
            const r2 = this.rooms[i+1].center;
            
            let x = r1.x;
            let y = r1.y;
            
            while (x !== r2.x) {
                this.map[y][x] = 0;
                x += Math.sign(r2.x - x);
            }
            while (y !== r2.y) {
                this.map[y][x] = 0;
                y += Math.sign(r2.y - y);
            }
        }
    }

    print() {
        let out = "";
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                out += this.map[y][x] === 1 ? "██" : "  ";
            }
            out += "\n";
        }
        console.log(out);
    }
}

// Node.js test execution
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
    const generator = new DungeonGenerator(40, 20);
    generator.generate();
    generator.print();
}
