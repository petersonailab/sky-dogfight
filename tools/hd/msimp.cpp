// Simplify one indexed triangle mesh with meshoptimizer (attribute-aware), then optimise for the vertex cache.
// in.bin : u32 nv, u32 ni, u32 nattr, u32 target_index_count, f32 target_error, u32 options,
//          f32 pos[nv*3], f32 attr[nv*nattr], f32 weights[nattr], u8 lock[nv], u32 idx[ni]
// out.bin: u32 n_out, f32 result_error, u32 idx[n_out]
// build: g++ -O2 -o msimp msimp.cpp -I<meshoptimizer>/src <meshoptimizer>/build/release/libmeshoptimizer.a
#include "meshoptimizer.h"
#include <cstdio>
#include <cstdlib>
#include <vector>
#include <cstdint>

static void rd(FILE* f, void* p, size_t n) { if (n && fread(p, 1, n, f) != n) { fprintf(stderr, "short read\n"); exit(1); } }

int main(int argc, char** argv) {
	if (argc < 3) { fprintf(stderr, "usage: msimp in.bin out.bin\n"); return 1; }
	FILE* f = fopen(argv[1], "rb");
	if (!f) { perror("in"); return 1; }
	uint32_t nv, ni, na, target; float err; uint32_t opts;
	rd(f, &nv, 4); rd(f, &ni, 4); rd(f, &na, 4); rd(f, &target, 4); rd(f, &err, 4); rd(f, &opts, 4);
	std::vector<float> pos(size_t(nv) * 3), attr(size_t(nv) * (na ? na : 1)), w(na ? na : 1);
	std::vector<unsigned char> lock(nv);
	std::vector<uint32_t> idx(ni);
	rd(f, pos.data(), pos.size() * 4 / (1)); // pos
	if (na) rd(f, attr.data(), size_t(nv) * na * 4);
	if (na) rd(f, w.data(), size_t(na) * 4);
	rd(f, lock.data(), nv);
	rd(f, idx.data(), size_t(ni) * 4);
	fclose(f);
	std::vector<uint32_t> out(ni);
	float rerr = 0;
	size_t n;
	if (na)
		n = meshopt_simplifyWithAttributes(out.data(), idx.data(), ni, pos.data(), nv, 12, attr.data(), na * 4, w.data(), na, lock.data(), target, err, opts, &rerr);
	else
		n = meshopt_simplify(out.data(), idx.data(), ni, pos.data(), nv, 12, target, err, opts, &rerr);
	out.resize(n);
	meshopt_optimizeVertexCache(out.data(), out.data(), n, nv);
	FILE* g = fopen(argv[2], "wb");
	uint32_t n32 = uint32_t(n);
	fwrite(&n32, 4, 1, g); fwrite(&rerr, 4, 1, g); fwrite(out.data(), 4, n, g);
	fclose(g);
	return 0;
}
