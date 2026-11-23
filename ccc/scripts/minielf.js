// TODO: make this a dependency?
class DataWriter {
    constructor(buffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.pos = 0;
        this.addressSize = 8;
    }

    writeBytes(array) {
        for (let i = 0; i < array.length; i++) {
            this.view.setUint8(this.pos++, array[i]);
        }
    }

    writeZeros(count) {
        for (let i = 0; i < count; i++) {
            this.view.setUint8(this.pos++, 0);
        }
    }

    writeByte(byte) {
        this.view.setUint8(this.pos++, byte);
    }

    writeWord(word) {
        this.view.setUint16(this.pos, word);
        this.pos += 2;
    }

    writeDword(word) {
        this.view.setUint32(this.pos, word);
        this.pos += 4;
    }

    writeAddress(address) {
        if(this.addressSize === 8) {
            this.view.setBigUint64(this.pos, address);
            this.pos += 8;
        } else {
            this.view.setUint32(this.pos, address);
            this.pos += 4;
        }
    }

    seek(pos) {
        this.pos = pos;
    }

    setAddressSize(size) {
        this.addressSize = size;
    }
}

class ELFSection {
    // source: https://en.wikipedia.org/wiki/Executable_and_Linkable_Format
    static SHT_NULL = 0x0; // Section header table entry unused
    static SHT_PROGBITS = 0x1; // Program data
    static SHT_SYMTAB = 0x2; // Symbol table
    static SHT_STRTAB = 0x3; // String table
    static SHT_RELA = 0x4; // Relocation entries with addends
    static SHT_HASH = 0x5; // Symbol hash table
    static SHT_DYNAMIC = 0x6; // Dynamic linking information
    static SHT_NOTE = 0x7; // Notes
    static SHT_NOBITS = 0x8; // Program space with no data (bss)
    static SHT_REL = 0x9; // Relocation entries, no addends
    static SHT_SHLIB = 0x0A; // Reserved
    static SHT_DYNSYM = 0x0B; // Dynamic linker symbol table
    static SHT_INIT_ARRAY = 0x0E; // Array of constructors
    static SHT_FINI_ARRAY = 0x0F; // Array of destructors
    static SHT_PREINIT_ARRAY = 0x10; // Array of pre-constructors
    static SHT_GROUP = 0x11; // Section group
    static SHT_SYMTAB_SHNDX = 0x12; // Extended section indices
    static SHT_NUM = 0x13; // Number of defined types.

    static SHF_WRITE = 0x1; // Writable
    static SHF_ALLOC = 0x2; // Occupies memory during execution
    static SHF_EXECINSTR = 0x4; // Executable
    static SHF_MERGE = 0x10; // Might be merged
    static SHF_STRINGS = 0x20; // Contains null-terminated strings
    static SHF_INFO_LINK = 0x40; // sh_info contains SHT index
    static SHF_LINK_ORDER = 0x80; // Preserve order after combining
    static SHF_OS_NONCONFORMING = 0x100; // Non-standard OS specific handling required
    static SHF_GROUP = 0x200; // Section is member of a group
    static SHF_TLS = 0x400; // Section holds thread-local data

    constructor(name, type) {
        this.name = name;
        this.type = type;
        this.flags = 0x0;

        this.nameOffset = 0x0; // offset of the name in the shstrtab table body
        this.body = null; // Uint8Array, set when serializing
        this.writer = null; // DataWriter the body of a data section is written with
        this.symbols = []; // symbols defined in this section: { name, offset, size }
        this.relocations = []; // { offset, symbolName }

        this.virtualAddress = 0x0;
        this.offset = 0x0;
        this.size = 0x0;
        this.link = 0x0;
        this.info = 0x0;
        this.addressAlign = type === ELFSection.SHT_NULL ? 0x0 : 0x4;
        this.entitySize = 0x0;

    }

    addSymbol(name, callback) {
        const offset = this.writer.pos;
        callback(this.writer);
        this.symbols.push({ name: name, offset: offset, size: this.writer.pos - offset });
    }

    serialize(writer) {
        writer.writeDword(this.nameOffset);
        writer.writeDword(this.type);
        writer.writeAddress(this.flags); // 8 bytes on 64-bit systems
        writer.writeAddress(this.virtualAddress);
        writer.writeAddress(this.offset);
        writer.writeAddress(this.size);
        writer.writeDword(this.link);
        writer.writeDword(this.info);
        writer.writeAddress(this.addressAlign);
        writer.writeAddress(this.entitySize);
    }
}

class ELFFile {
    static MAGIC = [0x7f, 0x45, 0x4c, 0x46];

    static TYPE_32BIT = 1;
    static TYPE_64BIT = 2;

    static ENDIAN_LITTLE = 1; // TODO: not supported
    static ENDIAN_BIG = 2;

    static OBJECT_TYPE_NONE = 0;
    static OBJECT_TYPE_REL = 1;
    static OBJECT_TYPE_EXEC = 2;
    static OBJECT_TYPE_DYN = 3;
    static OBJECT_TYPE_CORE = 4;

    static MACHINE_MIPS = 8; // TODO: support all

    static HEADER_SIZE = 0x34;
    static SECTION_HEADER_SIZE = 0x28;
    static SYMBOL_SIZE = 0x10;
    static RELOCATION_SIZE = 0x8;

    static SYMBOL_UNDEFINED = 0x10; // global, no type
    static SYMBOL_OBJECT = 0x11; // global, object

    static R_MIPS_32 = 2;

    constructor() {
        this.type = ELFFile.TYPE_32BIT;
        this.endianness = ELFFile.ENDIAN_BIG;
        this.objectType = ELFFile.OBJECT_TYPE_REL;
        this.machine = ELFFile.MACHINE_MIPS;

        this.entrypoint = 0x0;
        this.programHeader = 0x0;
        this.sectionHeader = 0x0;

        this.sections = [];
        this.undefinedSymbols = []; // names, in order of first use

        // Add required null section
        this.addSection("", ELFSection.SHT_NULL);
    }

    // TODO: add setter

    addSection(name, type) {
        const section = new ELFSection(name, type);
        this.sections.push(section);
        return section;
    }

    addRodataSection(name) {
        const section = this.addSection(name, ELFSection.SHT_PROGBITS);
        section.flags = ELFSection.SHF_ALLOC;
        // TODO: the body can not grow beyond this size
        section.writer = new DataWriter(new ArrayBuffer(0x10000));
        section.writer.setAddressSize(4);
        return section;
    }

    addUnresolvedSymbol(writer, name) {
        const section = this.sections.find((candidate) => candidate.writer === writer);
        section.relocations.push({ offset: writer.pos, symbolName: name });
        if(!this.undefinedSymbols.includes(name)) {
            this.undefinedSymbols.push(name);
        }
        writer.writeAddress(0);
    }

    createStringTable(names) {
        const encodedNames = names.map((name) => new TextEncoder().encode(name));
        const writer = new DataWriter(new ArrayBuffer(1 + encodedNames.reduce((size, bytes) => size + bytes.length + 1, 0)));
        const offsets = new Map();
        writer.writeZeros(1); // the first string is empty
        names.forEach((name, i) => {
            offsets.set(name, writer.pos);
            writer.writeBytes(encodedNames[i]);
            writer.writeZeros(1);
        });
        return { body: new Uint8Array(writer.buffer), offsets: offsets };
    }

    buildSections() {
        const sections = [...this.sections];
        for(const section of this.sections.slice(1)) {
            section.body = new Uint8Array(section.writer.buffer, 0, section.writer.pos);
        }

        const withRelocations = this.sections.filter((section) => section.relocations.length > 0);
        const symbolTableIndex = sections.length + withRelocations.length;

        const definedSymbols = [];
        for(const section of this.sections) {
            for(const symbol of section.symbols) {
                definedSymbols.push({ ...symbol, sectionIndex: this.sections.indexOf(section) });
            }
        }
        const symbolNames = [...definedSymbols.map((symbol) => symbol.name), ...this.undefinedSymbols];
        const stringTable = this.createStringTable(symbolNames);

        for(const section of withRelocations) {
            sections.push(this.createRelocationSection(section, definedSymbols, symbolTableIndex));
        }
        sections.push(this.createSymbolTableSection(definedSymbols, stringTable, symbolTableIndex + 1));
        sections.push(this.createStringTableSection(".strtab", stringTable));
        sections.push(this.createSectionNamesSection(sections));

        return sections;
    }

    createRelocationSection(target, definedSymbols, symbolTableIndex) {
        const writer = new DataWriter(new ArrayBuffer(target.relocations.length * ELFFile.RELOCATION_SIZE));
        writer.setAddressSize(4);
        for(const relocation of target.relocations) {
            const symbolIndex = 1 + definedSymbols.length + this.undefinedSymbols.indexOf(relocation.symbolName);
            writer.writeAddress(relocation.offset);
            writer.writeDword((symbolIndex << 8) | ELFFile.R_MIPS_32);
        }

        const section = new ELFSection(".rel" + target.name, ELFSection.SHT_REL);
        section.body = new Uint8Array(writer.buffer);
        section.link = symbolTableIndex;
        section.info = this.sections.indexOf(target);
        section.entitySize = ELFFile.RELOCATION_SIZE;
        return section;
    }

    createSymbolTableSection(definedSymbols, stringTable, stringTableIndex) {
        const writer = new DataWriter(new ArrayBuffer((1 + stringTable.offsets.size) * ELFFile.SYMBOL_SIZE));
        writer.setAddressSize(4);
        writer.writeZeros(ELFFile.SYMBOL_SIZE); // null symbol
        for(const symbol of definedSymbols) {
            writer.writeDword(stringTable.offsets.get(symbol.name));
            writer.writeAddress(symbol.offset);
            writer.writeAddress(symbol.size);
            writer.writeByte(ELFFile.SYMBOL_OBJECT);
            writer.writeByte(0); // other
            writer.writeWord(symbol.sectionIndex);
        }
        for(const name of this.undefinedSymbols) {
            writer.writeDword(stringTable.offsets.get(name));
            writer.writeAddress(0);
            writer.writeAddress(0);
            writer.writeByte(ELFFile.SYMBOL_UNDEFINED);
            writer.writeByte(0); // other
            writer.writeWord(0); // undefined
        }

        const section = new ELFSection(".symtab", ELFSection.SHT_SYMTAB);
        section.body = new Uint8Array(writer.buffer);
        section.link = stringTableIndex;
        section.info = 1; // index of the first global symbol
        section.entitySize = ELFFile.SYMBOL_SIZE;
        return section;
    }

    createStringTableSection(name, stringTable) {
        const section = new ELFSection(name, ELFSection.SHT_STRTAB);
        section.body = stringTable.body;
        return section;
    }

    createSectionNamesSection(sections) {
        const section = new ELFSection(".shstrtab", ELFSection.SHT_STRTAB);
        const named = [...sections.slice(1), section];
        const stringTable = this.createStringTable(named.map((namedSection) => namedSection.name));
        for(const namedSection of named) {
            namedSection.nameOffset = stringTable.offsets.get(namedSection.name);
        }
        section.body = stringTable.body;
        return section;
    }

    layout(sections) {
        let position = ELFFile.HEADER_SIZE;
        for(const section of sections.slice(1)) {
            position = (position + 3) & ~3; // align to 4
            section.offset = position;
            section.size = section.body.length;
            position += section.size;
        }
        this.sectionHeader = (position + 3) & ~3;
    }

    serialize() {
        const sections = this.buildSections();
        this.layout(sections);

        const out = new Uint8Array(this.sectionHeader + sections.length * ELFFile.SECTION_HEADER_SIZE);
        const writer = new DataWriter(out.buffer);

        this.serializeHeader(writer, sections);
        this.serializeSectionBodies(writer, sections);
        this.serializeSectionHeaders(writer, sections);

        return out;
    }

    serializeSectionHeaders(writer, sections) {
        writer.seek(this.sectionHeader);
        for(const section of sections) {
            section.serialize(writer);
        }
    }

    serializeSectionBodies(writer, sections) {
        for(const section of sections.slice(1)) {
            writer.seek(section.offset);
            writer.writeBytes(section.body);
        }
    }

    serializeHeader(writer, sections) {
        writer.writeBytes(ELFFile.MAGIC);
        writer.writeByte(this.type);
        writer.setAddressSize(this.type === ELFFile.TYPE_32BIT ? 4 : 8);
        writer.writeByte(this.endianness);
        writer.writeByte(1); // version
        writer.writeByte(0); // OS TODO: not supported
        writer.writeByte(0); // ABI version TODO: not supported
        writer.writeZeros(7);
        writer.writeWord(this.objectType);
        writer.writeWord(this.machine);
        writer.writeDword(1); // version
        writer.writeAddress(this.entrypoint);
        writer.writeAddress(this.programHeader);
        writer.writeAddress(this.sectionHeader);

        // serialize arch flags
        // TODO: find the correct for MIPS, currently copying existing ones
        writer.writeDword(0x10001001);
        writer.writeWord(this.type === ELFFile.TYPE_32BIT ? 0x34 : 0x40); // size of elf header
        writer.writeWord(0); // TODO: size of programheader
        writer.writeWord(0); // TODO: entries inprogramheader
        writer.writeWord(this.type === ELFFile.TYPE_32BIT ? 0x28 : 0x40); // size of section header
        writer.writeWord(sections.length); // entries in section header
        writer.writeWord(sections.length - 1); // index of the shstrtab section, which is the last one
    }

}

export { ELFFile };
